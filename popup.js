document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const fileInput = document.getElementById('fileInput');
    const addFilesBtn = document.getElementById('addFilesBtn');
    const addFilesContent = document.getElementById('addFilesContent');
    const addFilesSpinner = document.getElementById('addFilesSpinner');
    const errorModal = document.getElementById('errorModal');
    const errorMessage = document.getElementById('errorMessage');
    const closeModalBtn = document.getElementById('closeModalBtn');
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
    const shuffleBtn = document.getElementById('shuffleBtn');
    const repeatBtn = document.getElementById('repeatBtn');
    const repeatOneIndicator = document.getElementById('repeatOneIndicator');
    const searchInput = document.getElementById('searchInput'); // New search input

    // --- State Variable ---
    let playerState = {}; // Local cache of the player state

    // --- Functions to send messages to the background script ---
    function sendMessage(type, data, callback) {
        chrome.runtime.sendMessage({ target: 'background', type, data }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Message error:", chrome.runtime.lastError.message);
            } else if (callback) {
                callback(response);
            }
        });
    }

    // --- Event Listeners ---
    addFilesBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    playPauseBtn.addEventListener('click', togglePlayPause);
    nextBtn.addEventListener('click', () => sendMessage('next'));
    prevBtn.addEventListener('click', () => sendMessage('previous'));
    seekBar.addEventListener('input', handleSeek);
    volumeBar.addEventListener('input', handleVolumeChange);
    shuffleBtn.addEventListener('click', () => sendMessage('toggle-shuffle'));
    repeatBtn.addEventListener('click', () => sendMessage('cycle-repeat'));
    closeModalBtn.addEventListener('click', () => errorModal.classList.add('hidden'));
    searchInput.addEventListener('input', () => updateUI(playerState)); // Update UI on search

    // --- Initialization ---
    sendMessage('get-state', null, (response) => {
        if (response) {
            playerState = response;
            updateUI(playerState);
        }
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'state-update') {
            playerState = message.data;
            updateUI(playerState);
        }
    });

    // --- UI Update Function ---
    function updateUI(state) {
        const currentPlaylist = state.isShuffled ? state.shuffledPlaylist : state.playlist;
        const searchTerm = searchInput.value.toLowerCase();
        
        // **FIX**: Get the actual currently playing track object
        const currentTrack = currentPlaylist && currentPlaylist[state.currentTrackIndex];

        playlistEl.innerHTML = '';
        if (!currentPlaylist || currentPlaylist.length === 0) {
            playlistEl.innerHTML = '<li class="text-center text-gray-500 p-4">Add songs to get started!</li>';
        } else {
            let foundSongs = false;
            currentPlaylist.forEach((file, index) => {
                if (file.name.toLowerCase().includes(searchTerm)) {
                    foundSongs = true;
                    const li = document.createElement('li');
                    li.textContent = file.name;
                    li.title = file.name;
                    li.className = 'p-3 cursor-pointer rounded-md hover:bg-gray-700 transition-colors truncate';
                    
                    li.dataset.originalIndex = index;

                    // **FIX**: Compare the file object with the current track object
                    if (currentTrack && file.name === currentTrack.name) {
                        li.classList.add('playing');
                    }
                    li.addEventListener('click', () => {
                        sendMessage('play', parseInt(li.dataset.originalIndex, 10));
                    });
                    playlistEl.appendChild(li);
                }
            });

            if (!foundSongs) {
                 playlistEl.innerHTML = '<li class="text-center text-gray-500 p-4">No songs match your search.</li>';
            }
        }

        if (currentTrack) {
            trackTitleEl.textContent = currentTrack.name.replace(/\.[^/.]+$/, "");
        } else {
            trackTitleEl.textContent = "No song selected";
        }

        playPauseIcon.classList.toggle('ph-play', !state.isPlaying);
        playPauseIcon.classList.toggle('ph-pause', state.isPlaying);

        seekBar.max = state.duration || 0;
        seekBar.value = state.currentTime || 0;
        currentTimeEl.textContent = formatTime(state.currentTime);
        totalDurationEl.textContent = formatTime(state.duration);

        volumeBar.value = state.volume;

        shuffleBtn.classList.toggle('active-control', state.isShuffled);
        repeatBtn.classList.toggle('active-control', state.repeatMode !== 'none');
        repeatOneIndicator.classList.toggle('hidden', state.repeatMode !== 'one');
    }

    // --- Event Handlers ---
    async function handleFileSelect() {
        addFilesBtn.disabled = true;
        addFilesContent.classList.add('hidden');
        addFilesSpinner.classList.remove('hidden');

        try {
            const files = Array.from(fileInput.files);
            if (files.length === 0) return;

            const filesData = await Promise.all(files.map(async (file) => {
                const base64 = await fileToBase64(file);
                return { name: file.name, type: file.type, data: base64 };
            }));
            
            sendMessage('add-files', filesData);

        } catch (error) {
            console.error("Error adding files:", error);
            errorMessage.textContent = "Error adding files. Please try again.";
            errorModal.classList.remove('hidden');
        } finally {
            addFilesBtn.disabled = false;
            addFilesContent.classList.remove('hidden');
            addFilesSpinner.classList.add('hidden');
            fileInput.value = '';
        }
    }

    function togglePlayPause() {
        if (playPauseIcon.classList.contains('ph-play')) {
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

    // --- Utility Functions ---
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds === 0) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            if (!(file instanceof Blob)) {
                return reject(new TypeError("Failed to read file: The provided object is not a Blob."));
            }
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }
});
