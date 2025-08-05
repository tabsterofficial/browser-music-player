// --- State Management ---
// These variables hold the player's state.
let playlist = [];
let currentTrackIndex = 0;
let isPlaying = false;
let currentTime = 0;
let volume = 1;

// --- Offscreen Document Management ---
// The offscreen document is a hidden page that allows us to play audio from a service worker.
let creating; // A promise that resolves when the offscreen document is created

async function setupOffscreenDocument(path) {
    // Check if we have an existing offscreen document
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        return;
    }

    // Create the offscreen document if it doesn't exist.
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

// Function to send a message to the offscreen document to control the audio
async function sendMessageToOffscreen(type, data) {
    await setupOffscreenDocument('offscreen.html');
    await chrome.runtime.sendMessage({ type, data });
}


// --- State Persistence ---
// Load the player's state from chrome.storage when the extension starts
chrome.runtime.onStartup.addListener(async () => {
    await loadState();
});

// Initialize state when the extension is installed
chrome.runtime.onInstalled.addListener(async () => {
    await loadState();
});

async function loadState() {
    const data = await chrome.storage.local.get(['playlist', 'currentTrackIndex', 'currentTime', 'volume']);
    playlist = data.playlist || [];
    currentTrackIndex = data.currentTrackIndex || 0;
    currentTime = data.currentTime || 0;
    volume = data.volume !== undefined ? data.volume : 1;
    
    // If a playlist exists, load the track but don't play it automatically
    if (playlist.length > 0) {
        const track = playlist[currentTrackIndex];
        // We need to re-create blob URLs as they are not persistent
        const file = await base64ToFile(track.data, track.name, track.type);
        const url = URL.createObjectURL(file);
        sendMessageToOffscreen('load', { url, currentTime, volume });
    }
}

async function saveState() {
    await chrome.storage.local.set({
        playlist,
        currentTrackIndex,
        currentTime,
        volume
    });
}

// --- Message Handling ---
// Listens for messages from the popup or the offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Using a switch statement to handle different message types
    switch (message.type) {
        case 'get-state':
            sendResponse({ playlist, currentTrackIndex, isPlaying, currentTime, volume });
            break;
        case 'add-files':
            addFiles(message.data);
            break;
        case 'play':
            playTrack(message.data);
            break;
        case 'pause':
            pauseTrack();
            break;
        case 'next':
            playNext();
            break;
        case 'previous':
            playPrevious();
            break;
        case 'seek':
            seek(message.data.time);
            break;
        case 'set-volume':
            setVolume(message.data.volume);
            break;
        case 'time-update':
            // Received from the offscreen document when the time changes
            currentTime = message.data.currentTime;
            saveState(); // Save progress periodically
            break;
        case 'ended':
            // Received from the offscreen document when a track finishes
            playNext();
            break;
    }
    // Return true to indicate that sendResponse will be called asynchronously
    return true;
});


// --- Playback Logic ---

async function addFiles(files) {
    const wasPlaylistEmpty = playlist.length === 0;
    // Convert files to a serializable format (base64) for storage
    for (const file of files) {
        const base64 = await fileToBase64(file);
        playlist.push({
            name: file.name,
            type: file.type,
            data: base64
        });
    }
    await saveState();
    if (wasPlaylistEmpty && playlist.length > 0) {
        await playTrack(0);
    }
}

async function playTrack(index) {
    if (index !== undefined) {
        currentTrackIndex = index;
    }
    if (playlist.length === 0 || currentTrackIndex < 0 || currentTrackIndex >= playlist.length) {
        return;
    }
    
    const track = playlist[currentTrackIndex];
    const file = await base64ToFile(track.data, track.name, track.type);
    const url = URL.createObjectURL(file);

    isPlaying = true;
    sendMessageToOffscreen('play', { url, currentTime, volume });
    await saveState();
}

function pauseTrack() {
    isPlaying = false;
    sendMessageToOffscreen('pause');
    saveState();
}

async function playNext() {
    currentTime = 0; // Reset time for the next track
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    await playTrack();
}

async function playPrevious() {
    currentTime = 0; // Reset time for the previous track
    currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    await playTrack();
}

function seek(time) {
    currentTime = time;
    sendMessageToOffscreen('seek', { time });
    saveState();
}

function setVolume(newVolume) {
    volume = newVolume;
    sendMessageToOffscreen('set-volume', { volume });
    saveState();
}


// --- Utility Functions ---
// These helpers convert files to and from a storable format.
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function base64ToFile(base64, fileName, fileType) {
    const res = await fetch(base64);
    const blob = await res.blob();
    return new File([blob], fileName, { type: fileType });
}
