// Wait for the DOM to be fully loaded before running the script
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
    const currentTimeEl = document.getElementById('totalDuration'); // Swapped for clarity
    const totalDurationEl = document.getElementById('currentTime'); // Swapped for clarity
    const volumeBar = document.getElementById('volumeBar');

    // --- Functions to send messages to the background script ---
    function sendMessage(type, data) {
        chrome.runtime.sendMessage({ type, data });
    }

    // --- Event Listeners ---
    addFilesBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    playPauseBtn.addEventListener('click', togglePlayPause);
    nextBtn.addEventListener('click', () => sendMessage('next'));
    prevBtn.addEventListener('click', () => sendMessage('previous'));
    seekBar.addEventListener('input', handleSeek);
    volumeBar.addEventListener('input', handleVolumeChange);

    // --- Initialization ---
    // Request the current state from the background script when the popup opens
    chrome.runtime.sendMessage({ type: 'get-state' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            // Handle the error, maybe show a message to the user
        } else if (response) {
            updateUI(response);
        }
    });

    // Listen for state updates from the background script
    chrome.runtime.onMessage.addListener((message) => {
        // This listener is for broadcasts from the background, e.g., when a track changes
        if (message.type === 'state-update') {
            updateUI(message.data);
        }
    });

    // --- UI Update Function ---
    function updateUI(state) {
        // Update playlist
        playlistEl.innerHTML = '';
        if (state.playlist.length === 0) {
            playlistEl.innerHTML = '<li class="text-center text-gray-500 p-4">Add songs to get started!</li>';
        } else {
            state.playlist.forEach((file, index) => {
                const li = document.createElement('li');
                li.textContent = file.name;
                li.title = file.name;
                li.className = 'p-3 cursor-pointer rounded-md hover:bg-gray-700 transition-colors truncate';
                if (index === state.currentTrackIndex) {
                    li.classList.add('playing');
                }
                li.addEventListener('click', () => sendMessage('play', index));
                playlistEl.appendChild(li);
            });
        }

        // Update track info
        if (state.playlist.length > 0) {
            const currentTrack = state.playlist[state.currentTrackIndex];
            trackTitleEl.textContent = currentTrack.name.replace(/\.[^/.]+$/, "");
        } else {
            trackTitleEl.textContent = "No song selected";
        }

        // Update play/pause button
        if (state.isPlaying) {
            playPauseIcon.classList.remove('ph-play');
            playPauseIcon.classList.add('ph-pause');
        } else {
            playPauseIcon.classList.remove('ph-pause');
            playPauseIcon.classList.add('ph-play');
        }

        // Update seek bar and time
        seekBar.value = state.currentTime;
        // We can't know the duration from here, so we'll just show current time
        currentTimeEl.textContent = formatTime(state.currentTime);
        totalDurationEl.textContent = "---"; // Duration is handled in the background

        // Update volume
        volumeBar.value = state.volume;
    }

    // --- Event Handlers ---
    function handleFileSelect() {
        const files = Array.from(fileInput.files);
        sendMessage('add-files', files);
    }

    function togglePlayPause() {
        const icon = playPauseIcon;
        if (icon.classList.contains('ph-play')) {
            sendMessage('play');
        } else {
            sendMessage('pause');
        }
    }

    function handleSeek() {
        sendMessage('seek', { time: parseFloat(seekBar.value) });
    }

    function handleVolumeChange() {
        sendMessage('set-volume', { volume: parseFloat(volumeBar.value) });
    }

    // --- Utility Function ---
    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }
});
