// --- State Management ---
// A single object to hold the player's state for easier management.
let playerState = {
    playlist: [],
    shuffledPlaylist: [],
    currentTrackIndex: 0,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isShuffled: false,
    repeatMode: 'none', // 'none', 'all', 'one'
};

// --- Offscreen Document Management ---
let creating; // A promise that resolves when the offscreen document is created

async function setupOffscreenDocument(path) {
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        return;
    }

    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'To play audio in the background',
        });
        await creating;
        creating = null;
    }
}

async function sendMessageToOffscreen(type, data) {
    await setupOffscreenDocument('offscreen.html');
    // This message is specifically for the offscreen document
    chrome.runtime.sendMessage({ target: 'offscreen', command: type, data });
}


// --- State Persistence & Synchronization ---
chrome.runtime.onStartup.addListener(loadState);
chrome.runtime.onInstalled.addListener(loadState);

async function loadState() {
    console.log('Attempting to load state...');
    const data = await chrome.storage.local.get(['playerState']);
    if (data.playerState) {
        // Merge saved state with defaults to ensure all keys are present
        playerState = { ...playerState, ...data.playerState, isPlaying: false };
    }
    
    // If shuffle is on, regenerate the shuffled playlist based on the loaded order
    if (playerState.isShuffled) {
        generateShuffledPlaylist();
    }
    
    console.log('State loaded:', playerState);
    
    // If a playlist exists, load the track into the offscreen player but don't play it.
    const currentTrack = getCurrentTrack();
    if (currentTrack) {
        const file = await base64ToFile(currentTrack.data, currentTrack.name, currentTrack.type);
        const url = URL.createObjectURL(file);
        sendMessageToOffscreen('load', { url, currentTime: playerState.currentTime, volume: playerState.volume });
    }
}

let saveStateTimeout;
function saveState(immediate = false) {
    clearTimeout(saveStateTimeout);
    if (immediate) {
        performSave();
    } else {
        // Debounce state saves to prevent writing to storage too frequently.
        saveStateTimeout = setTimeout(performSave, 500);
    }
}

async function performSave() {
    console.log('Saving state:', playerState);
    await chrome.storage.local.set({ playerState });
}

function broadcastState() {
    chrome.runtime.sendMessage({ type: 'state-update', data: playerState });
}

// --- Message Handling ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // **FIX**: This listener now accepts messages from the popup (which have no target)
    // and messages specifically targeted at the background script. It ignores messages
    // meant for the offscreen document.
    if (message.target === 'offscreen') {
        return;
    }

    // Wrap in an async IIFE to handle promises correctly
    (async () => {
        try {
            switch (message.type) {
                case 'get-state': sendResponse(playerState); break;
                case 'add-files': await addFiles(message.data); break;
                case 'play': await playTrack(message.data); break;
                case 'pause': await pauseTrack(); break;
                case 'next': await playNext(); break;
                case 'previous': await playPrevious(); break;
                case 'seek': await seek(message.data.time); break;
                case 'set-volume': await setVolume(message.data.volume); break;
                case 'toggle-shuffle': await toggleShuffle(); break;
                case 'cycle-repeat': await cycleRepeatMode(); break;
                case 'time-update':
                    playerState.currentTime = message.data.currentTime;
                    playerState.duration = message.data.duration;
                    broadcastState();
                    saveState(); // Debounced save
                    break;
                case 'ended': await handleTrackEnd(); break;
            }
        } catch (error) {
            console.error(`Error handling message type ${message.type}:`, error);
        }
    })();
    
    return true; // Indicates an asynchronous response
});


// --- Playback Logic ---

async function addFiles(files) {
    const wasPlaylistEmpty = playerState.playlist.length === 0;
    playerState.playlist.push(...files);
    
    if (playerState.isShuffled) {
        playerState.shuffledPlaylist.push(...files);
    }

    await saveState(true);
    if (wasPlaylistEmpty && playerState.playlist.length > 0) {
        await playTrack(0);
    }
    broadcastState();
}

async function playTrack(index) {
    if (index !== undefined) {
        playerState.currentTrackIndex = index;
    }
    
    const currentTrack = getCurrentTrack();
    if (!currentTrack) return;
    
    if (index !== undefined) {
        playerState.currentTime = 0;
    }

    const file = await base64ToFile(currentTrack.data, currentTrack.name, currentTrack.type);
    const url = URL.createObjectURL(file);

    playerState.isPlaying = true;
    sendMessageToOffscreen('play', { url, currentTime: playerState.currentTime, volume: playerState.volume });
    await saveState(true);
    broadcastState();
}

async function pauseTrack() {
    playerState.isPlaying = false;
    sendMessageToOffscreen('pause');
    await saveState(true);
    broadcastState();
}

async function handleTrackEnd() {
    if (playerState.repeatMode === 'one') {
        playTrack(playerState.currentTrackIndex);
    } else {
        playNext(true);
    }
}

async function playNext(fromEnded = false) {
    const currentPlaylist = playerState.isShuffled ? playerState.shuffledPlaylist : playerState.playlist;
    if (currentPlaylist.length === 0) return;

    const isLastTrack = playerState.currentTrackIndex >= currentPlaylist.length - 1;

    if (isLastTrack && playerState.repeatMode === 'all') {
        playerState.currentTrackIndex = 0;
    } else if (isLastTrack && fromEnded && playerState.repeatMode === 'none') {
        playerState.isPlaying = false;
        playerState.currentTime = 0;
        await saveState(true);
        broadcastState();
        return;
    } else {
        playerState.currentTrackIndex = (playerState.currentTrackIndex + 1) % currentPlaylist.length;
    }
    await playTrack();
}

async function playPrevious() {
    const currentPlaylist = playerState.isShuffled ? playerState.shuffledPlaylist : playerState.playlist;
    if (currentPlaylist.length === 0) return;
    playerState.currentTrackIndex = (playerState.currentTrackIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    await playTrack();
}

function seek(time) {
    playerState.currentTime = time;
    sendMessageToOffscreen('seek', { time });
    saveState();
    broadcastState();
}

function setVolume(newVolume) {
    playerState.volume = newVolume;
    sendMessageToOffscreen('set-volume', { volume: newVolume });
    saveState();
    broadcastState();
}

// --- Shuffle & Repeat Logic ---
function generateShuffledPlaylist() {
    const currentTrack = getCurrentTrack();
    playerState.shuffledPlaylist = [...playerState.playlist].sort(() => Math.random() - 0.5);
    if (currentTrack) {
        const newIndex = playerState.shuffledPlaylist.findIndex(track => track.name === currentTrack.name);
        if (newIndex !== -1) {
            // Move current track to the start of the shuffled playlist to avoid interruption
            const [item] = playerState.shuffledPlaylist.splice(newIndex, 1);
            playerState.shuffledPlaylist.unshift(item);
            playerState.currentTrackIndex = 0;
        }
    }
}

async function toggleShuffle() {
    playerState.isShuffled = !playerState.isShuffled;
    
    if (playerState.isShuffled) {
        generateShuffledPlaylist();
    } else {
        const currentShuffledTrack = playerState.shuffledPlaylist[playerState.currentTrackIndex];
        playerState.currentTrackIndex = playerState.playlist.findIndex(track => track.name === currentShuffledTrack.name);
    }
    await saveState(true);
    broadcastState();
}

async function cycleRepeatMode() {
    const modes = ['none', 'all', 'one'];
    const currentIndex = modes.indexOf(playerState.repeatMode);
    playerState.repeatMode = modes[(currentIndex + 1) % modes.length];
    await saveState(true);
    broadcastState();
}

function getCurrentTrack() {
    const activePlaylist = playerState.isShuffled ? playerState.shuffledPlaylist : playerState.playlist;
    return activePlaylist[playerState.currentTrackIndex];
}

// --- Utility Functions ---
async function base64ToFile(base64, fileName, fileType) {
    const res = await fetch(base64);
    const blob = await res.blob();
    return new File([blob], fileName, { type: fileType });
}
