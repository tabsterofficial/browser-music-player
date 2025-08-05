// Wait for the DOM to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const audioPlayer = document.getElementById('audioPlayer');
    const fileInput = document.getElementById('fileInput');
    const addFilesBtn = document.getElementById('addFilesBtn');
    
    // UI Elements
    const playlistEl = document.getElementById('playlist');
    const trackTitleEl = document.getElementById('trackTitle');
    const albumArtEl = document.getElementById('albumArt');
    
    // Control Buttons
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playPauseIcon = document.getElementById('playPauseIcon');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    // Progress and Volume
    const seekBar = document.getElementById('seekBar');
    const currentTimeEl = document.getElementById('currentTime');
    const totalDurationEl = document.getElementById('totalDuration');
    const volumeBar = document.getElementById('volumeBar');

    // --- State Variables ---
    let playlist = [];
    let currentTrackIndex = 0;
    let isPlaying = false;

    // --- Event Listeners ---

    // Trigger hidden file input when "Add Songs" button is clicked
    addFilesBtn.addEventListener('click', () => fileInput.click());
    
    // Handle file selection
    fileInput.addEventListener('change', handleFileSelect);

    // Playback controls
    playPauseBtn.addEventListener('click', togglePlayPause);
    nextBtn.addEventListener('click', playNext);
    prevBtn.addEventListener('click', playPrevious);

    // Audio player events
    audioPlayer.addEventListener('ended', playNext); // Autoplay next song
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('loadedmetadata', updateDuration);

    // Seek and volume bar controls
    seekBar.addEventListener('input', handleSeek);
    volumeBar.addEventListener('input', handleVolumeChange);


    // --- Core Functions ---

    /**
     * Handles the selection of audio files.
     * Populates the playlist and starts playing the first track.
     */
    function handleFileSelect() {
        // Convert FileList to array and add to existing playlist
        const newFiles = Array.from(fileInput.files);
        if (newFiles.length === 0) return;

        const wasPlaylistEmpty = playlist.length === 0;
        playlist.push(...newFiles);
        
        updatePlaylistUI();

        // If the playlist was empty, start playing the first new song
        if (wasPlaylistEmpty) {
            loadTrack(0);
        }
    }

    /**
     * Loads a specific track from the playlist into the audio player.
     * @param {number} index - The index of the track in the playlist.
     */
    function loadTrack(index) {
        if (index < 0 || index >= playlist.length) return;
        
        currentTrackIndex = index;
        const file = playlist[index];
        const fileURL = URL.createObjectURL(file);
        audioPlayer.src = fileURL;

        // Update UI with track information
        trackTitleEl.textContent = file.name.replace(/\.[^/.]+$/, ""); // Remove file extension
        trackTitleEl.title = file.name; // Show full name on hover
        
        updatePlaylistUI(); // To highlight the new track
        playTrack(); // Automatically play the loaded track
    }

    /**
     * Toggles between playing and pausing the current track.
     */
    function togglePlayPause() {
        if (playlist.length === 0) return;

        if (isPlaying) {
            pauseTrack();
        } else {
            playTrack();
        }
    }
    
    /**
     * Plays the current audio track.
     */
    function playTrack() {
        if (playlist.length === 0) return;
        const playPromise = audioPlayer.play();

        if (playPromise !== undefined) {
            playPromise.then(_ => {
                isPlaying = true;
                playPauseIcon.classList.remove('ph-play');
                playPauseIcon.classList.add('ph-pause');
            })
            .catch(error => {
                console.error("Playback failed:", error);
                // Auto-play was prevented.
                isPlaying = false;
                 playPauseIcon.classList.remove('ph-pause');
                playPauseIcon.classList.add('ph-play');
            });
        }
    }

    /**
     * Pauses the current audio track.
     */
    function pauseTrack() {
        audioPlayer.pause();
        isPlaying = false;
        playPauseIcon.classList.remove('ph-pause');
        playPauseIcon.classList.add('ph-play');
    }

    /**
     * Plays the next track in the playlist.
     */
    function playNext() {
        if (playlist.length === 0) return;
        currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
        loadTrack(currentTrackIndex);
    }

    /**
     * Plays the previous track in the playlist.
     */
    function playPrevious() {
        if (playlist.length === 0) return;
        currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
        loadTrack(currentTrackIndex);
    }


    // --- UI Update Functions ---

    /**
     * Renders the playlist in the UI.
     * Highlights the currently playing track.
     */
    function updatePlaylistUI() {
        playlistEl.innerHTML = ''; // Clear the list

        if (playlist.length === 0) {
            playlistEl.innerHTML = '<li class="text-center text-gray-500 p-4">Add songs to get started!</li>';
            return;
        }

        playlist.forEach((file, index) => {
            const li = document.createElement('li');
            li.textContent = file.name;
            li.title = file.name;
            li.className = 'p-3 cursor-pointer rounded-md hover:bg-gray-700 transition-colors truncate';
            
            // Highlight the currently loaded track
            if (index === currentTrackIndex) {
                li.classList.add('playing');
            }
            
            // Add click event to play the song
            li.addEventListener('click', () => loadTrack(index));
            
            playlistEl.appendChild(li);
        });
    }

    /**
     * Updates the seek bar and current time display as the song plays.
     */
    function updateProgress() {
        if (isNaN(audioPlayer.duration)) return;
        const progressPercent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        seekBar.value = progressPercent;
        currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    }
    
    /**
     * Updates the total duration display when a track is loaded.
     */
    function updateDuration() {
         if (isNaN(audioPlayer.duration)) return;
         totalDurationEl.textContent = formatTime(audioPlayer.duration);
    }

    /**
     * Handles user interaction with the seek bar.
     */
    function handleSeek() {
        if (isNaN(audioPlayer.duration)) return;
        const seekTime = (seekBar.value / 100) * audioPlayer.duration;
        audioPlayer.currentTime = seekTime;
    }

    /**
     * Handles user interaction with the volume bar.
     */
    function handleVolumeChange() {
        audioPlayer.volume = volumeBar.value;
    }


    // --- Utility Functions ---

    /**
     * Formats time in seconds to a "minutes:seconds" string.
     * @param {number} seconds - The time in seconds.
     * @returns {string} The formatted time string (e.g., "3:21").
     */
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }
});
