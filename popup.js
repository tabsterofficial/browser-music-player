document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const fileInput = document.getElementById('fileInput');
    const addFilesBtn = document.getElementById('addFilesBtn');
    const playlistEl = document.getElementById('playlist');
    const trackTitleEl = document.getElementById('trackTitle');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playPauseIcon = document.getElementById('playPauseIcon');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const seekBar = document.getElementById('seekBar');
    const currentTimeEl = document.getElementById('currentTime');
    const totalDurationEl = document.getElementById('totalDuration');
    const volumeBar = document.getElementById('volumeBar');

    let isUpdatingSeekBar = false;
    let currentState = null;

    // --- Functions to send messages to the background script ---
    async function sendMessage(type, data) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type, data }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Message error:', chrome.runtime.lastError.message);
                    resolve({ error: chrome.runtime.lastError.message });
                } else {
                    resolve(response || {});
                }
            });
        });
    }

    // --- Event Listeners ---
    addFilesBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    playPauseBtn.addEventListener('click', togglePlayPause);
    nextBtn.addEventListener('click', () => sendMessage('next'));
    prevBtn.addEventListener('click', () => sendMessage('previous'));
    
    // Seek bar handling
    seekBar.addEventListener('mousedown', () => {
        isUpdatingSeekBar = true;
    });
    
    seekBar.addEventListener('mouseup', () => {
        isUpdatingSeekBar = false;
        handleSeek();
    });
    
    seekBar.addEventListener('input', (e) => {
        if (isUpdatingSeekBar) {
            // Show preview of time while dragging
            const time = parseFloat(e.target.value);
            currentTimeEl.textContent = formatTime(time);
        }
    });
    
    volumeBar.addEventListener('input', handleVolumeChange);

    // --- Initialization ---
    initializePopup();

    async function initializePopup() {
        try {
            const response = await sendMessage('get-state');
            if (response && !response.error) {
                currentState = response;
                updateUI(response);
            } else {
                console.error('Failed to get initial state:', response?.error);
                showEmptyState();
            }
        } catch (error) {
            console.error('Error initializing popup:', error);
            showEmptyState();
        }
    }

    // Listen for state updates from the background script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'state-update') {
            currentState = message.data;
            updateUI(message.data);
        }
    });

    // --- UI Update Function ---
    function updateUI(state) {
        updatePlaylist(state);
        updateTrackInfo(state);
        updatePlayPauseButton(state);
        updateSeekBar(state);
        updateVolume(state);
    }

    function updatePlaylist(state) {
        playlistEl.innerHTML = '';
        
        if (!state.playlist || state.playlist.length === 0) {
            playlistEl.innerHTML = '<li class="text-center text-gray-500 p-4">Add songs to get started!</li>';
            return;
        }

        state.playlist.forEach((file, index) => {
            const li = document.createElement('li');
            li.textContent = file.name;
            li.title = file.name;
            li.className = 'p-3 cursor-pointer rounded-md hover:bg-gray-700 transition-colors truncate';
            
            if (index === state.currentTrackIndex) {
                li.classList.add('playing');
                if (state.isPlaying) {
                    li.innerHTML = `<i class="ph ph-speaker-simple-high mr-2"></i>${file.name}`;
                }
            }
            
            li.addEventListener('click', () => sendMessage('play', index));
            playlistEl.appendChild(li);
        });
    }

    function updateTrackInfo(state) {
        if (state.playlist && state.playlist.length > 0 && state.currentTrackIndex < state.playlist.length) {
            const currentTrack = state.playlist[state.currentTrackIndex];
            trackTitleEl.textContent = currentTrack.name.replace(/\.[^/.]+$/, "");
        } else {
            trackTitleEl.textContent = "No song selected";
        }
    }

    function updatePlayPauseButton(state) {
        playPauseIcon.classList.remove('ph-play', 'ph-pause');
        
        if (state.isPlaying) {
            playPauseIcon.classList.add('ph-pause');
            playPauseBtn.title = 'Pause';
        } else {
            playPauseIcon.classList.add('ph-play');
            playPauseBtn.title = 'Play';
        }
    }

    function updateSeekBar(state) {
        if (!isUpdatingSeekBar) {
            const currentTime = state.currentTime || 0;
            const duration = state.duration || 0;
            
            seekBar.max = duration > 0 ? duration : 100;
            seekBar.value = currentTime;
            
            currentTimeEl.textContent = formatTime(currentTime);
            totalDurationEl.textContent = duration > 0 ? formatTime(duration) : "---";
        }
    }

    function updateVolume(state) {
        if (volumeBar.value != state.volume) {
            volumeBar.value = state.volume;
        }
    }

    function showEmptyState() {
        playlistEl.innerHTML = '<li class="text-center text-gray-500 p-4">Add songs to get started!</li>';
        trackTitleEl.textContent = "No song selected";
        playPauseIcon.classList.remove('ph-pause');
        playPauseIcon.classList.add('ph-play');
        currentTimeEl.textContent = "0:00";
        totalDurationEl.textContent = "---";
    }

    // --- Event Handlers ---
    async function handleFileSelect() {
        const files = Array.from(fileInput.files);
        if (files.length === 0) return;

        // Show loading state
        addFilesBtn.textContent = 'Adding...';
        addFilesBtn.disabled = true;

        try {
            const response = await sendMessage('add-files', files);
            if (response.error) {
                console.error('Error adding files:', response.error);
                alert('Error adding files. Please try again.');
            }
        } catch (error) {
            console.error('Error adding files:', error);
            alert('Error adding files. Please try again.');
        } finally {
            // Reset button state
            addFilesBtn.innerHTML = '<i class="ph ph-plus"></i><span>Add Songs</span>';
            addFilesBtn.disabled = false;
            fileInput.value = ''; // Clear file input
        }
    }

    async function togglePlayPause() {
        if (!currentState || !currentState.playlist || currentState.playlist.length === 0) {
            return;
        }

        const isCurrentlyPlaying = playPauseIcon.classList.contains('ph-pause');
        
        if (isCurrentlyPlaying) {
            await sendMessage('pause');
        } else {
            await sendMessage('play');
        }
    }

    function handleSeek() {
        const time = parseFloat(seekBar.value);
        sendMessage('seek', { time });
    }

    function handleVolumeChange() {
        const volume = parseFloat(volumeBar.value);
        sendMessage('set-volume', { volume });
    }

    // --- Utility Function ---
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Handle popup close
    window.addEventListener('beforeunload', () => {
        // Music continues playing in background
        console.log('Popup closing, music continues in background');
    });
});