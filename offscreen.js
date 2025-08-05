const audioPlayer = document.getElementById('audio-player');

console.log('Offscreen document loaded');

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Offscreen received message:', message.type);
    
    switch (message.type) {
        case 'play':
            play(message.data);
            break;
        case 'pause':
            audioPlayer.pause();
            break;
        case 'load':
            load(message.data);
            break;
        case 'seek':
            if (message.data && typeof message.data.time === 'number') {
                audioPlayer.currentTime = message.data.time;
            }
            break;
        case 'set-volume':
            if (message.data && typeof message.data.volume === 'number') {
                audioPlayer.volume = Math.max(0, Math.min(1, message.data.volume));
            }
            break;
    }
    
    sendResponse({ success: true });
    return true;
});

function play(data) {
    try {
        // If it's a new track, set the src
        if (data.url && audioPlayer.src !== data.url) {
            audioPlayer.src = data.url;
        }
        
        // Set volume
        if (typeof data.volume === 'number') {
            audioPlayer.volume = Math.max(0, Math.min(1, data.volume));
        }
        
        // Seek to the correct time before playing
        if (typeof data.currentTime === 'number' && data.currentTime >= 0) {
            audioPlayer.currentTime = data.currentTime;
        }
        
        // Play the audio
        audioPlayer.play().catch(error => {
            console.error('Error playing audio:', error);
        });
        
        console.log('Started playing audio');
    } catch (error) {
        console.error('Error in play function:', error);
    }
}

function load(data) {
    try {
        if (data.url) {
            audioPlayer.src = data.url;
            
            if (typeof data.volume === 'number') {
                audioPlayer.volume = Math.max(0, Math.min(1, data.volume));
            }
            
            if (typeof data.currentTime === 'number' && data.currentTime >= 0) {
                audioPlayer.currentTime = data.currentTime;
            }
            
            audioPlayer.load();
            console.log('Loaded audio track');
        }
    } catch (error) {
        console.error('Error in load function:', error);
    }
}

// Forward audio events to the background script
audioPlayer.addEventListener('timeupdate', () => {
    chrome.runtime.sendMessage({
        type: 'time-update',
        data: {
            currentTime: audioPlayer.currentTime,
            duration: audioPlayer.duration || 0
        }
    }).catch(() => {
        // Background script might not be ready, ignore error
    });
});

audioPlayer.addEventListener('ended', () => {
    console.log('Audio ended');
    chrome.runtime.sendMessage({ type: 'ended' }).catch(() => {
        // Background script might not be ready, ignore error
    });
});

audioPlayer.addEventListener('loadedmetadata', () => {
    console.log('Audio metadata loaded, duration:', audioPlayer.duration);
    chrome.runtime.sendMessage({
        type: 'loaded',
        data: { duration: audioPlayer.duration || 0 }
    }).catch(() => {
        // Background script might not be ready, ignore error
    });
});

audioPlayer.addEventListener('error', (e) => {
    console.error('Audio error:', e);
});

audioPlayer.addEventListener('canplay', () => {
    console.log('Audio can play');
});

audioPlayer.addEventListener('play', () => {
    console.log('Audio play event');
});

audioPlayer.addEventListener('pause', () => {
    console.log('Audio pause event');
});