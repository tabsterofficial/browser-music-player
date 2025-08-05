// --- State Management ---
let playlist = [];
let currentTrackIndex = 0;
let isPlaying = false;
let currentTime = 0;
let duration = 0;
let volume = 1;

// --- Offscreen Document Management ---
let creating;

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
    return chrome.runtime.sendMessage({ type, data });
}

// --- State Persistence ---
chrome.runtime.onStartup.addListener(async () => {
    console.log('Extension starting up...');
    await loadState();
});

chrome.runtime.onInstalled.addListener(async () => {
    console.log('Extension installed/updated...');
    await loadState();
});

// Initialize when service worker starts
(async () => {
    console.log('Service worker initialized...');
    await loadState();
})();

async function loadState() {
    try {
        const data = await chrome.storage.local.get([
            'playlist', 
            'currentTrackIndex', 
            'currentTime', 
            'volume',
            'isPlaying'
        ]);
        
        playlist = data.playlist || [];
        currentTrackIndex = Math.max(0, Math.min(data.currentTrackIndex || 0, playlist.length - 1));
        currentTime = data.currentTime || 0;
        volume = data.volume !== undefined ? data.volume : 1;
        isPlaying = false; // Always start paused
        
        console.log('State loaded:', { playlistLength: playlist.length, currentTrackIndex, currentTime, volume });
        
        // If a playlist exists, load the track but don't auto-play
        if (playlist.length > 0 && currentTrackIndex < playlist.length) {
            const track = playlist[currentTrackIndex];
            const file = await base64ToFile(track.data, track.name, track.type);
            const url = URL.createObjectURL(file);
            await sendMessageToOffscreen('load', { url, currentTime, volume });
        }
    } catch (error) {
        console.error('Error loading state:', error);
    }
}

async function saveState() {
    try {
        await chrome.storage.local.set({
            playlist,
            currentTrackIndex,
            currentTime,
            volume,
            isPlaying
        });
        
        // Broadcast state update to all popup instances
        broadcastStateUpdate();
    } catch (error) {
        console.error('Error saving state:', error);
    }
}

function broadcastStateUpdate() {
    // Send state update to popup if it's open
    chrome.runtime.sendMessage({
        type: 'state-update',
        data: {
            playlist,
            currentTrackIndex,
            isPlaying,
            currentTime,
            duration,
            volume
        }
    }).catch(() => {
        // Popup might not be open, ignore error
    });
}

// --- Message Handling ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message.type);
    
    (async () => {
        try {
            switch (message.type) {
                case 'get-state':
                    sendResponse({ 
                        playlist, 
                        currentTrackIndex, 
                        isPlaying, 
                        currentTime, 
                        duration,
                        volume 
                    });
                    break;
                    
                case 'add-files':
                    await addFiles(message.data);
                    sendResponse({ success: true });
                    break;
                    
                case 'play':
                    await playTrack(message.data);
                    sendResponse({ success: true });
                    break;
                    
                case 'pause':
                    await pauseTrack();
                    sendResponse({ success: true });
                    break;
                    
                case 'next':
                    await playNext();
                    sendResponse({ success: true });
                    break;
                    
                case 'previous':
                    await playPrevious();
                    sendResponse({ success: true });
                    break;
                    
                case 'seek':
                    await seek(message.data.time);
                    sendResponse({ success: true });
                    break;
                    
                case 'set-volume':
                    await setVolume(message.data.volume);
                    sendResponse({ success: true });
                    break;
                    
                case 'time-update':
                    currentTime = message.data.currentTime;
                    if (message.data.duration) {
                        duration = message.data.duration;
                    }
                    broadcastStateUpdate();
                    // Save state less frequently to avoid performance issues
                    if (Math.floor(currentTime) % 5 === 0) {
                        await saveState();
                    }
                    sendResponse({ success: true });
                    break;
                    
                case 'ended':
                    await playNext();
                    sendResponse({ success: true });
                    break;
                    
                case 'loaded':
                    duration = message.data.duration || 0;
                    broadcastStateUpdate();
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
        }
    })();
    
    return true; // Keep message channel open for async response
});

// --- Playback Logic ---
async function addFiles(files) {
    const wasPlaylistEmpty = playlist.length === 0;
    
    for (const file of files) {
        const base64 = await fileToBase64(file);
        playlist.push({
            name: file.name,
            type: file.type,
            data: base64
        });
    }
    
    await saveState();
    
    // If playlist was empty, load the first track but don't auto-play
    if (wasPlaylistEmpty && playlist.length > 0) {
        currentTrackIndex = 0;
        const track = playlist[0];
        const file = await base64ToFile(track.data, track.name, track.type);
        const url = URL.createObjectURL(file);
        await sendMessageToOffscreen('load', { url, currentTime: 0, volume });
    }
}

async function playTrack(index) {
    if (index !== undefined && index !== currentTrackIndex) {
        currentTrackIndex = index;
        currentTime = 0; // Reset time when switching tracks
    }
    
    if (playlist.length === 0 || currentTrackIndex < 0 || currentTrackIndex >= playlist.length) {
        console.warn('Invalid track or empty playlist');
        return;
    }
    
    const track = playlist[currentTrackIndex];
    const file = await base64ToFile(track.data, track.name, track.type);
    const url = URL.createObjectURL(file);

    isPlaying = true;
    await sendMessageToOffscreen('play', { url, currentTime, volume });
    await saveState();
    
    console.log('Playing track:', track.name);
}

async function pauseTrack() {
    isPlaying = false;
    await sendMessageToOffscreen('pause');
    await saveState();
    console.log('Paused playback');
}

async function playNext() {
    if (playlist.length === 0) return;
    
    currentTime = 0;
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    await playTrack();
}

async function playPrevious() {
    if (playlist.length === 0) return;
    
    currentTime = 0;
    currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    await playTrack();
}

async function seek(time) {
    currentTime = time;
    await sendMessageToOffscreen('seek', { time });
    await saveState();
}

async function setVolume(newVolume) {
    volume = newVolume;
    await sendMessageToOffscreen('set-volume', { volume });
    await saveState();
}

// --- Utility Functions ---
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

// Keep service worker alive
chrome.runtime.onMessage.addListener(() => {
    // This empty listener helps prevent the service worker from being terminated
});

// Periodic state save to prevent data loss
setInterval(async () => {
    if (isPlaying) {
        await saveState();
    }
}, 30000); // Save every 30 seconds when playing