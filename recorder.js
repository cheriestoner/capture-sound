// View switching
document.addEventListener('DOMContentLoaded', () => {
    const navRecorder = document.querySelector('#nav-recorder')
    const navSurvey = document.querySelector('#nav-survey')
    const recorderView = document.querySelector('#recorder-view')
    const surveyView = document.querySelector('#survey-view')

    navRecorder.onclick = () => {
        recorderView.classList.add('active')
        surveyView.classList.remove('active')
        navRecorder.classList.add('active')
        navSurvey.classList.remove('active')
    }

    navSurvey.onclick = () => {
        surveyView.classList.add('active')
        recorderView.classList.remove('active')
        navSurvey.classList.add('active')
        navRecorder.classList.remove('active')
    }

    // Handle survey submission
    document.querySelector('#survey-form').onsubmit = (e) => {
        e.preventDefault()
        const formData = new FormData(e.target)
        const data = Object.fromEntries(formData)
        console.log('Survey submitted:', data)
        // Here you can add code to handle the survey data
        alert('Survey submitted successfully!')
        e.target.reset()
    }
})

// Record plugin
console.log('recorder.js starting...');

let wavesurfer, record, editorWavesurfer, editorRegions
let scrollingWaveform = true
let continuousWaveform = false
let selectedSlot = null  // Track the selected slot
let audioContext = null
let micStream = null
let feedbackNode = null

// Function to get CSS variable value
const getCssVariable = (variableName) => {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();
}

const createWaveSurfer = () => {
    console.log('Creating WaveSurfer instance...')
    
  // Destroy the previous wavesurfer instance
  if (wavesurfer) {
        console.log('Destroying previous instance')
    wavesurfer.destroy()
  }

    // Get colors from CSS variables
    const waveColor = getCssVariable('--waveform-color');
    const progressColor = getCssVariable('--waveform-progress-color');

  // Create a new Wavesurfer instance
  wavesurfer = WaveSurfer.create({
    container: '#mic',
        waveColor: waveColor,
        progressColor: progressColor,
        height: 110,
        normalize: false,
        fillParent: true,
    })

    console.log('WaveSurfer instance created:', wavesurfer ? 'success' : 'failed')

  // Initialize the Record plugin
    try {
  record = wavesurfer.registerPlugin(
            WaveSurfer.Record.create({
      renderRecordedAudio: false,
      scrollingWaveform,
      continuousWaveform,
                continuousWaveformDuration: 30,
            }),
        )
        console.log('Record plugin created:', record ? 'success' : 'failed')
    } catch (error) {
        console.error('Error creating Record plugin:', error)
        return
    }

    // Set up feedback loop handler
    const feedbackCheckbox = document.querySelector('#feedbackLoop')
    const gainSlider = document.querySelector('#gainSlider')
    let gainNode = null

    // Initialize gain value (now 100 = 1x amplification)
    let currentGain = gainSlider.value / 100

    gainSlider.addEventListener('input', (e) => {
        currentGain = e.target.value / 100  // Convert percentage to gain multiplier
        if (gainNode) {
            gainNode.gain.value = currentGain
        }
    })

    feedbackCheckbox.onchange = async (e) => {
        if (e.target.checked) {
            try {
                // Initialize audio context if not exists
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)({
                        // Request low latency operation
                        latencyHint: 'interactive',
                        sampleRate: 48000
                    })
                }

                // Get microphone stream if not exists
                if (!micStream) {
                    micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            // Request low latency audio
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false,
                            latency: 0
                        }
                    })
                }

                // Create and connect nodes
                const source = audioContext.createMediaStreamSource(micStream)
                const destination = audioContext.destination
                
                // Create gain node with current gain value
                gainNode = audioContext.createGain()
                gainNode.gain.value = currentGain

                // Connect the nodes
                source.connect(gainNode)
                gainNode.connect(destination)
                
                // Store the nodes for cleanup
                feedbackNode = {
                    source,
                    gainNode,
                    destination
                }

            } catch (error) {
                console.error('Error setting up feedback loop:', error)
                e.target.checked = false
                alert('Could not enable feedback loop. Please check your microphone permissions.')
            }
        } else {
            // Disconnect feedback loop
            if (feedbackNode) {
                feedbackNode.source.disconnect()
                feedbackNode.gainNode.disconnect()
                feedbackNode = null
            }
            if (micStream) {
                micStream.getTracks().forEach(track => track.stop())
                micStream = null
            }
            if (audioContext) {
                audioContext.close()
                audioContext = null
            }
            gainNode = null
        }
    }

    // Set up event handlers after Record is initialized
    const pauseButton = document.querySelector('#pause')
    const recButton = document.querySelector('#record')
    const recIcon = recButton.querySelector('img')
    const pauseIcon = pauseButton.querySelector('img')

    console.log('Setting up event handlers...')

    // Function to update global controls based on selected slot
    const updateGlobalControls = () => {
        const globalControls = document.querySelector('#global-controls')
        const globalPlay = document.querySelector('#global-play img')
        const globalDownload = document.querySelector('#global-download')
        const waveformContainer = selectedSlot?.querySelector('.waveform')
        
        if (selectedSlot && !selectedSlot.classList.contains('empty')) {
            globalControls.classList.remove('disabled')
            const wavesurfer = waveformContainer.wavesurfer
            const recordedUrl = selectedSlot.dataset.recordedUrl

            // Update play button
            document.querySelector('#global-play').onclick = () => wavesurfer.playPause()
            wavesurfer.on('pause', () => {
                globalPlay.src = 'icons/play-circle.svg'
            })
            wavesurfer.on('play', () => {
                globalPlay.src = 'icons/pause-circle.svg'
            })

            // Update edit button
            document.querySelector('#global-edit').onclick = () => {
                const editorModal = document.querySelector('#editor-modal')
                const closeBtn = document.querySelector('#close-editor')
                
                // Show modal
                editorModal.style.display = 'block'
                
                // Create new editor wavesurfer instance
                if (editorWavesurfer) {
                    editorWavesurfer.destroy()
                }
                
                // Create new editor wavesurfer instance
                editorWavesurfer = WaveSurfer.create({
                    container: '#editor-waveform',
                    height: 128,
                    normalize: false,
                    url: recordedUrl,
                    plugins: [
                        WaveSurfer.Spectrogram.create({
                            labels: true,
                            height: 128,
                            colorMap: "gray",
                            splitChannels: false,
                            scale: 'logarithmic',
                            frequencyMin: 0,
                            frequencyMax: 8000,
                        })
                    ]
                })

                // Initialize regions plugin
                editorRegions = editorWavesurfer.registerPlugin(WaveSurfer.Regions.create())

                // Add play/pause functionality
                const editorPlay = document.querySelector('#editor-play')
                const editorPlayIcon = editorPlay.querySelector('img')
                
                editorPlay.onclick = () => {
                    const region = editorRegions.getRegions()[0]
                    if (!region) return

                    if (editorWavesurfer.isPlaying()) {
                        editorWavesurfer.pause()
                    } else {
                        // Start playback from region start
                        editorWavesurfer.play(region.start, region.end)
                    }
                }

                editorWavesurfer.on('pause', () => {
                    editorPlayIcon.src = 'icons/play-circle.svg'
                })
                editorWavesurfer.on('play', () => {
                    editorPlayIcon.src = 'icons/pause-circle.svg'
                })

                // Stop playback when reaching region end
                editorWavesurfer.on('timeupdate', (currentTime) => {
                    const region = editorRegions.getRegions()[0]
                    if (region && currentTime >= region.end) {
                        editorWavesurfer.pause()
                    }
                })

                // Add trim functionality
                const editorTrim = document.querySelector('#editor-trim')
                editorTrim.onclick = () => {
                    const region = editorRegions.getRegions()[0]
                    if (!region) {
                        alert('Please select a region to trim')
                        return
                    }

                    // Get the audio element
                    const audio = editorWavesurfer.getMediaElement()
                    
                    // Create an AudioContext
                    const audioContext = new AudioContext()
                    
                    // Fetch the audio file
                    fetch(recordedUrl)
                        .then(response => response.arrayBuffer())
                        .then(buffer => audioContext.decodeAudioData(buffer))
                        .then(audioBuffer => {
                            // Calculate start and end samples
                            const startSample = Math.floor(region.start * audioBuffer.sampleRate)
                            const endSample = Math.floor(region.end * audioBuffer.sampleRate)
                            const duration = endSample - startSample
                            
                            // Create new buffer for the trimmed audio
                            const trimmedBuffer = new AudioContext().createBuffer(
                                audioBuffer.numberOfChannels,
                                duration,
                                audioBuffer.sampleRate
                            )
                            
                            // Copy the selected region to the new buffer
                            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                                const channelData = audioBuffer.getChannelData(channel)
                                const trimmedData = trimmedBuffer.getChannelData(channel)
                                for (let i = 0; i < duration; i++) {
                                    trimmedData[i] = channelData[startSample + i]
                                }
                            }
                            
                            // Convert trimmed buffer to blob
                            const trimmedBlob = audioBufferToBlob(trimmedBuffer)
                            
                            // Update the slot with trimmed audio
                            const trimmedUrl = URL.createObjectURL(trimmedBlob)
                            URL.revokeObjectURL(recordedUrl)
                            
                            selectedSlot.dataset.recordedUrl = trimmedUrl
                            const slotWavesurfer = selectedSlot.querySelector('.waveform').wavesurfer
                            slotWavesurfer.load(trimmedUrl)
                            
                            // Update editor with trimmed audio
                            editorWavesurfer.load(trimmedUrl)
                            editorRegions.clearRegions()
                        })
                }

                // Add region when audio is loaded
                editorWavesurfer.on('ready', () => {
                    editorRegions.addRegion({
                        start: 0,
                        end: editorWavesurfer.getDuration(),
                        color: 'rgba(0, 109, 217, 0.2)',
                        drag: true,
                        resize: true,
                        minLength: 0.1,
                        maxLength: editorWavesurfer.getDuration(),
                    })
                })

                // Close modal handler
                const closeModal = () => {
                    editorModal.style.display = 'none'
                    if (editorWavesurfer) {
                        editorWavesurfer.destroy()
                        editorWavesurfer = null
                    }
                }

                closeBtn.onclick = closeModal

                // Close on outside click
                editorModal.onclick = (e) => {
                    if (e.target === editorModal) {
                        closeModal()
                    }
                }
            }

            // Update download link
            globalDownload.href = recordedUrl
            globalDownload.download = selectedSlot.dataset.filename
            
            // Add click handler for download to include metadata
            globalDownload.onclick = (e) => {
                // If metadata exists, create a combined file
                if (selectedSlot.dataset.metadata) {
                    e.preventDefault()
                    
                    // Create a ZIP file containing audio and metadata
                    const zip = new JSZip()
                    
                    // Add the audio file
                    fetch(recordedUrl)
                        .then(response => response.blob())
                        .then(async audioBlob => {
                            // Add audio file to zip
                            zip.file(selectedSlot.dataset.filename, audioBlob)
                            
                            // Add metadata file
                            const metadata = JSON.parse(selectedSlot.dataset.metadata)
                            // Add tags if they exist
                            if (selectedSlot.dataset.tags) {
                                metadata.tags = JSON.parse(selectedSlot.dataset.tags)
                            }
                            zip.file('metadata.json', JSON.stringify(metadata, null, 2))

                            // Add photo if it exists
                            if (selectedSlot.dataset.photoUrl) {
                                const photoResponse = await fetch(selectedSlot.dataset.photoUrl)
                                const photoBlob = await photoResponse.blob()
                                zip.file('photo.jpg', photoBlob)
                            }
                            
                            // Generate zip file
                            return zip.generateAsync({type: 'blob'})
                        })
                        .then(zipBlob => {
                            // Create download link for zip
                            const zipUrl = URL.createObjectURL(zipBlob)
                            const tempLink = document.createElement('a')
                            tempLink.href = zipUrl
                            tempLink.download = selectedSlot.dataset.filename.replace(/\.[^/.]+$/, '') + '.zip'
                            tempLink.click()
                            URL.revokeObjectURL(zipUrl)
                        })
                }
            }

            // Update delete button
            document.querySelector('#global-delete').onclick = () => {
                URL.revokeObjectURL(recordedUrl)
                if (selectedSlot.dataset.photoUrl) {
                    URL.revokeObjectURL(selectedSlot.dataset.photoUrl)
                }
                wavesurfer.destroy()
                const number = selectedSlot.querySelector('.slot-number')
                selectedSlot.innerHTML = ''
                if (number) {
                    selectedSlot.appendChild(number)
                }
                selectedSlot.style.backgroundImage = ''
                selectedSlot.classList.remove('selected')
                selectedSlot.classList.add('empty')
                selectedSlot = null
                updateGlobalControls()
            }

            // Update camera button
            document.querySelector('#global-camera').onclick = () => {
                const cameraModal = document.querySelector('#camera-modal')
                const video = document.querySelector('#camera-preview')
                const canvas = document.querySelector('#photo-canvas')
                const takePhotoBtn = document.querySelector('#take-photo')
                const retakePhotoBtn = document.querySelector('#retake-photo')
                const savePhotoBtn = document.querySelector('#save-photo')
                const closeBtn = document.querySelector('#close-camera')
                let stream = null

                // Show modal and start camera
                cameraModal.style.display = 'block'
                navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        facingMode: { exact: "environment" }  // Use rear camera
                    } 
                })
                    .then(mediaStream => {
                        stream = mediaStream
                        video.srcObject = stream
                    })
                    .catch(error => {
                        // If rear camera fails, try front camera as fallback
                        console.log('Falling back to front camera:', error)
                        navigator.mediaDevices.getUserMedia({ 
                            video: true 
                        })
                            .then(mediaStream => {
                                stream = mediaStream
                                video.srcObject = stream
                            })
                            .catch(error => {
                                console.error('Error accessing camera:', error)
                                alert('Could not access camera. Please check your camera permissions.')
                                cameraModal.style.display = 'none'
                            })
                    })

                // Take photo
                takePhotoBtn.onclick = () => {
                    canvas.width = video.videoWidth
                    canvas.height = video.videoHeight
                    canvas.getContext('2d').drawImage(video, 0, 0)
                    video.style.display = 'none'
                    canvas.style.display = 'block'
                    takePhotoBtn.style.display = 'none'
                    retakePhotoBtn.style.display = 'inline'
                    savePhotoBtn.style.display = 'inline'
                }

                // Retake photo
                retakePhotoBtn.onclick = () => {
                    video.style.display = 'block'
                    canvas.style.display = 'none'
                    takePhotoBtn.style.display = 'inline'
                    retakePhotoBtn.style.display = 'none'
                    savePhotoBtn.style.display = 'none'
                }

                // Save photo
                savePhotoBtn.onclick = () => {
                    canvas.toBlob(blob => {
                        // Revoke previous photo URL if exists
                        if (selectedSlot.dataset.photoUrl) {
                            URL.revokeObjectURL(selectedSlot.dataset.photoUrl)
                        }
                        
                        const photoUrl = URL.createObjectURL(blob)
                        selectedSlot.style.backgroundImage = `url(${photoUrl})`
                        selectedSlot.dataset.photoUrl = photoUrl
                        
                        // Close camera
                        closeCamera()
                    }, 'image/jpeg', 0.8)
                }

                // Close camera
                const closeCamera = () => {
                    if (stream) {
                        stream.getTracks().forEach(track => track.stop())
                    }
                    video.srcObject = null
                    cameraModal.style.display = 'none'
                    video.style.display = 'block'
                    canvas.style.display = 'none'
                    takePhotoBtn.style.display = 'inline'
                    retakePhotoBtn.style.display = 'none'
                    savePhotoBtn.style.display = 'none'
                }

                closeBtn.onclick = closeCamera

                // Close on outside click
                cameraModal.onclick = (e) => {
                    if (e.target === cameraModal) {
                        closeCamera()
                    }
                }
            }

            // Update tag button
            document.querySelector('#global-tag').onclick = () => {
                const tagModal = document.querySelector('#tag-modal')
                const tagInput = document.querySelector('#tag-input')
                const addTagBtn = document.querySelector('#add-tag')
                const currentTags = document.querySelector('#current-tags')
                const closeBtn = document.querySelector('#close-tags')

                // Show modal
                tagModal.style.display = 'block'

                // Load existing tags
                currentTags.innerHTML = ''
                const existingTags = selectedSlot.dataset.tags ? JSON.parse(selectedSlot.dataset.tags) : []
                existingTags.forEach(tag => addTagElement(tag))

                // Function to add a tag
                function addTag(tagText) {
                    tagText = tagText.trim().toLowerCase()
                    if (tagText && !existingTags.includes(tagText)) {
                        existingTags.push(tagText)
                        addTagElement(tagText)
                        selectedSlot.dataset.tags = JSON.stringify(existingTags)
                        updateTagCount()
                    }
                    tagInput.value = ''
                }

                // Function to create tag element
                function addTagElement(tagText) {
                    const tag = document.createElement('div')
                    tag.className = 'tag'
                    tag.innerHTML = `
                        ${tagText}
                        <button class="remove-tag">×</button>
                    `
                    tag.querySelector('.remove-tag').onclick = () => {
                        const index = existingTags.indexOf(tagText)
                        if (index > -1) {
                            existingTags.splice(index, 1)
                            selectedSlot.dataset.tags = JSON.stringify(existingTags)
                            tag.remove()
                            updateTagCount()
                        }
                    }
                    currentTags.appendChild(tag)
                }

                // Function to update tag count badge
                function updateTagCount() {
                    let badge = selectedSlot.querySelector('.tag-count')
                    if (existingTags.length > 0) {
                        if (!badge) {
                            badge = document.createElement('div')
                            badge.className = 'tag-count'
                            selectedSlot.appendChild(badge)
                        }
                        badge.textContent = existingTags.length
                    } else if (badge) {
                        badge.remove()
                    }
                }

                // Handle input submission
                tagInput.onkeypress = (e) => {
                    if (e.key === 'Enter') {
                        addTag(tagInput.value)
                    }
                }

                addTagBtn.onclick = () => addTag(tagInput.value)

                // Handle quick tags
                document.querySelectorAll('.quick-tag').forEach(btn => {
                    btn.onclick = () => addTag(btn.dataset.tag)
                })

                // Close modal
                const closeModal = () => {
                    tagModal.style.display = 'none'
                    tagInput.value = ''
                }

                closeBtn.onclick = closeModal

                // Close on outside click
                tagModal.onclick = (e) => {
                    if (e.target === tagModal) {
                        closeModal()
                    }
                }
            }
        } else {
            globalControls.classList.add('disabled')
            globalPlay.src = 'icons/play-circle.svg'
            globalDownload.removeAttribute('href')
            globalDownload.removeAttribute('download')
        }
    }

    // Add click handlers for all slots
    document.querySelectorAll('.recording-slot').forEach(slot => {
        slot.onclick = () => {
            if (record.isRecording()) return

            // If clicking the same slot, deselect it
            if (selectedSlot === slot) {
                slot.classList.remove('selected')
                selectedSlot = null
            } else {
                // Deselect previous slot if any
                if (selectedSlot) {
                    selectedSlot.classList.remove('selected')
                }
                
                // Select new slot
                slot.classList.add('selected')
                selectedSlot = slot
            }
            
            // Update record button state based on if slot is empty
            recButton.disabled = selectedSlot ? !selectedSlot.classList.contains('empty') : true
            
            // Update global controls
            updateGlobalControls()
        }
    })

    // Pause button handler
    pauseButton.onclick = () => {
        console.log('Pause button clicked')
        if (record.isPaused()) {
            record.resumeRecording()
            pauseIcon.src = 'icons/pause-square.svg'
            return
        }

        record.pauseRecording()
        pauseIcon.src = 'icons/play-square.svg'
    }

    // Record button handler
    recButton.onclick = () => {
        console.log('Record button clicked')
        if (record.isRecording() || record.isPaused()) {
            console.log('Stopping recording')
            record.stopRecording()
            recIcon.src = 'icons/mic-off.svg'
            pauseButton.style.display = 'none'
            return
        }

        // Check if a slot is selected
        if (!selectedSlot) {
            console.log('No slot selected')
            alert('Please select a slot first')
            return
        }

        // If slot has existing recording, clean it up
        if (!selectedSlot.classList.contains('empty')) {
            // Find and revoke existing URL
            const existingLink = selectedSlot.querySelector('.downlink')
            if (existingLink) {
                URL.revokeObjectURL(existingLink.href)
            }
            
            // Find and destroy existing wavesurfer instance
            const existingWaveform = selectedSlot.querySelector('.waveform')
            if (existingWaveform && existingWaveform.wavesurfer) {
                existingWaveform.wavesurfer.destroy()
            }
            
            // Store the number
            const number = selectedSlot.querySelector('.slot-number')
            
            // Clear the slot
            selectedSlot.innerHTML = ''
            
            // Restore the number
            if (number) {
                selectedSlot.appendChild(number)
            }
        }

        recButton.disabled = true
        console.log('Starting recording...')

        // Start recording with default device
        record.startRecording()
            .then(() => {
                console.log('Recording started successfully')
                recIcon.src = 'icons/mic-on.svg'
                recButton.disabled = false
                pauseButton.style.display = 'inline'
            })
            .catch(error => {
                console.error('Error starting recording:', error)
                recButton.disabled = false
            })
    }

    // Set up settings popup handler
    const settingsButton = document.querySelector('#settings-button')
    const settingsPopup = document.querySelector('#settings-popup')
    
    // Add save all functionality
    const saveAllButton = document.querySelector('#save-all')
    saveAllButton.onclick = async () => {
        const zip = new JSZip()
        const slots = document.querySelectorAll('.recording-slot')
        let hasContent = false

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i]
            if (!slot.classList.contains('empty')) {
                hasContent = true
                const slotFolder = zip.folder(`slot-${i + 1}`)
                
                // Add audio file
                const audioResponse = await fetch(slot.dataset.recordedUrl)
                const audioBlob = await audioResponse.blob()
                slotFolder.file(slot.dataset.filename, audioBlob)
                
                // Add metadata if exists
                if (slot.dataset.metadata) {
                    const metadata = JSON.parse(slot.dataset.metadata)
                    if (slot.dataset.tags) {
                        metadata.tags = JSON.parse(slot.dataset.tags)
                    }
                    slotFolder.file('metadata.json', JSON.stringify(metadata, null, 2))
                }
                
                // Add photo if exists
                if (slot.dataset.photoUrl) {
                    const photoResponse = await fetch(slot.dataset.photoUrl)
                    const photoBlob = await photoResponse.blob()
                    slotFolder.file('photo.jpg', photoBlob)
                }
            }
        }

        if (!hasContent) {
            alert('No recordings to save')
            return
        }

        // Get selected location
        const selectedLocation = document.querySelector('.location-btn.active').dataset.location;

        // Generate and download zip file with location in filename
        const zipBlob = await zip.generateAsync({type: 'blob'})
        const zipUrl = URL.createObjectURL(zipBlob)
        const tempLink = document.createElement('a')
        tempLink.href = zipUrl
        tempLink.download = `recordings-${selectedLocation}-${new Date().toISOString().split('T')[0]}.zip`
        tempLink.click()
        URL.revokeObjectURL(zipUrl)
    }
    saveAllButton.disabled = false

    // Toggle settings popup
    settingsButton.onclick = (e) => {
        e.stopPropagation()
        settingsPopup.style.display = settingsPopup.style.display === 'none' ? 'block' : 'none'
    }

    // Close popup when clicking outside
    document.addEventListener('click', (e) => {
        if (!settingsPopup.contains(e.target) && e.target !== settingsButton) {
            settingsPopup.style.display = 'none'
        }
    })

    // Waveform options handlers
    document.querySelector('#scrollingWaveform').onclick = (e) => {
        console.log('Scrolling waveform option changed')
        scrollingWaveform = e.target.checked
        if (continuousWaveform && scrollingWaveform) {
            continuousWaveform = false
            document.querySelector('#continuousWaveform').checked = false
        }
        createWaveSurfer()
    }

    document.querySelector('#continuousWaveform').onclick = (e) => {
        console.log('Continuous waveform option changed')
        continuousWaveform = e.target.checked
        if (continuousWaveform && scrollingWaveform) {
            scrollingWaveform = false
            document.querySelector('#scrollingWaveform').checked = false
        }
        createWaveSurfer()
    }

  // Render recorded audio
  record.on('record-end', async (blob) => {
        if (!selectedSlot) return

        // Collect metadata
        const metadata = {
            timestamp: new Date().toISOString(),
            location: null
        }
        
        // Get geolocation if available
        if (navigator.geolocation) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject)
                })
                metadata.location = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                }
            } catch (error) {
                console.log('Geolocation error:', error)
            }
        }
        
        // Store metadata
        selectedSlot.dataset.metadata = JSON.stringify(metadata)

    const recordedUrl = URL.createObjectURL(blob)
        selectedSlot.classList.remove('selected', 'empty')
        
        // Store the number
        const number = selectedSlot.querySelector('.slot-number')
        
        // Create waveform container
        const waveformContainer = document.createElement('div')
        waveformContainer.className = 'waveform'
        selectedSlot.appendChild(waveformContainer)

        // Restore the number if it exists
        if (number) {
            selectedSlot.appendChild(number)
        }

        // Store URL and filename for global controls
        selectedSlot.dataset.recordedUrl = recordedUrl
        selectedSlot.dataset.filename = 'recording.' + blob.type.split(';')[0].split('/')[1] || 'webm'

        // Create wavesurfer instance
    const wavesurfer = WaveSurfer.create({
            container: waveformContainer,
            waveColor: getCssVariable('--recording-waveform-color'),
            progressColor: getCssVariable('--recording-progress-color'),
      url: recordedUrl,
            height: 80,
            normalize: false,
        })
        
        waveformContainer.wavesurfer = wavesurfer

        selectedSlot = null
        recButton.disabled = true
        updateGlobalControls()
    })

    record.on('record-start', () => {
        console.log('Recording started')
    })

  record.on('record-progress', (time) => {
    updateProgress(time)
    // Stop recording after 30 seconds (30000 milliseconds)
    if (time >= 30000) {
        console.log('Recording reached 30 seconds, stopping...')
        record.stopRecording()
        recIcon.src = 'icons/mic-off.svg'
        pauseButton.style.display = 'none'
    }
  })

    pauseButton.style.display = 'none'
    // recButton.textContent = 'Record'
    console.log('WaveSurfer setup complete')
}

const progress = document.querySelector('#progress')
const updateProgress = (time) => {
  // time will be in milliseconds, convert it to mm:ss format
  const formattedTime = [
    Math.floor((time % 3600000) / 60000), // minutes
    Math.floor((time % 60000) / 1000), // seconds
  ]
    .map((v) => (v < 10 ? '0' + v : v))
    .join(':')
  progress.textContent = formattedTime
}

// Mic selection
// const micSelect = document.querySelector('#mic-select')
// console.log('Getting available audio devices...')
// WaveSurfer.Record.getAvailableAudioDevices().then((devices) => {
//     console.log('Available audio devices:', devices)
//     devices.forEach((device) => {
//       const option = document.createElement('option')
//       option.value = device.deviceId
//       option.text = device.label || device.deviceId
//       micSelect.appendChild(option)
//     })
// }).catch(error => {
//     console.error('Error getting audio devices:', error)
// })

// Wait for everything to be loaded
function initialize() {
    console.log('Checking if WaveSurfer and Record are available...')
    if (typeof WaveSurfer === 'undefined') {
        console.error('WaveSurfer not loaded')
        return
    }
    if (typeof WaveSurfer.Record === 'undefined') {
        console.error('Record plugin not loaded')
    return
  }
    console.log('WaveSurfer and Record plugin are available, initializing...')
    createWaveSurfer()
}

// Try to initialize when the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize)
} else {
    initialize()
}

// Helper function to convert AudioBuffer to Blob
function audioBufferToBlob(audioBuffer) {
    const wavEncoder = new WavEncoder(audioBuffer.sampleRate, audioBuffer.numberOfChannels)
    const channelData = []
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        channelData.push(audioBuffer.getChannelData(channel))
    }
    wavEncoder.encode(channelData)
    const wavBlob = new Blob([wavEncoder.finish()], { type: 'audio/wav' })
    return wavBlob
}

// Simple WAV encoder
class WavEncoder {
    constructor(sampleRate, numChannels) {
        this.sampleRate = sampleRate
        this.numChannels = numChannels
        this.chunks = []
    }

    encode(channelData) {
        const dataLength = channelData[0].length * this.numChannels * 2
        const buffer = new ArrayBuffer(44 + dataLength)
        const view = new DataView(buffer)

        // Write WAV header
        writeString(view, 0, 'RIFF')
        view.setUint32(4, 36 + dataLength, true)
        writeString(view, 8, 'WAVE')
        writeString(view, 12, 'fmt ')
        view.setUint32(16, 16, true)
        view.setUint16(20, 1, true)
        view.setUint16(22, this.numChannels, true)
        view.setUint32(24, this.sampleRate, true)
        view.setUint32(28, this.sampleRate * this.numChannels * 2, true)
        view.setUint16(32, this.numChannels * 2, true)
        view.setUint16(34, 16, true)
        writeString(view, 36, 'data')
        view.setUint32(40, dataLength, true)

        // Write interleaved audio data
        let offset = 44
        for (let i = 0; i < channelData[0].length; i++) {
            for (let channel = 0; channel < this.numChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, channelData[channel][i]))
                view.setInt16(offset, sample * 0x7FFF, true)
                offset += 2
            }
        }

        this.chunks.push(buffer)
    }

    finish() {
        return new Uint8Array(this.chunks[0])
    }
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
    }
}

// Add location button handlers
document.querySelectorAll('.location-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.location-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
});