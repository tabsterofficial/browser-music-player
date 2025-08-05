    const audioPlayer = document.getElementById('audio-player');

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
                audioPlayer.currentTime = message.data.time;
                break;
            case 'set-volume':
                audioPlayer.volume = message.data.volume;
                break;
        }
        return true;
    });

    function play(data) {
        // If it's a new track, set the src. Otherwise, just play.
        if (data.url && audioPlayer.src !== data.url) {
            audioPlayer.src = data.url;
        }
        audioPlayer.volume = data.volume;
        // Seek to the correct time before playing
        if (data.currentTime) {
             audioPlayer.currentTime = data.currentTime;
        }
        audioPlayer.play();
    }
    
    function load(data) {
        if (data.url) {
            audioPlayer.src = data.url;
            audioPlayer.volume = data.volume;
            audioPlayer.currentTime = data.currentTime;
            audioPlayer.load();
        }
    }

    // Forward audio events to the background script
    audioPlayer.addEventListener('timeupdate', () => {
        chrome.runtime.sendMessage({ type: 'time-update', data: { currentTime: audioPlayer.currentTime } });
    });

    audioPlayer.addEventListener('ended', () => {
        chrome.runtime.sendMessage({ type: 'ended' });
    });
    