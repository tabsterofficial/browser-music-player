const fileInput = document.getElementById('fileInput');
const audioPlayer = document.getElementById('audioPlayer');
const playlistEl = document.getElementById('playlist');
let playlist = [];
let currentTrackIndex = 0;

fileInput.addEventListener('change', () => {
  playlist = Array.from(fileInput.files);
  updatePlaylistUI();
  playTrack(0);
});

function updatePlaylistUI() {
  playlistEl.innerHTML = '';
  playlist.forEach((file, index) => {
    const li = document.createElement('li');
    li.textContent = file.name;
    li.addEventListener('click', () => playTrack(index));
    playlistEl.appendChild(li);
  });
}

function playTrack(index) {
  if (playlist.length === 0) return;
  currentTrackIndex = index;
  const file = playlist[index];
  const url = URL.createObjectURL(file);
  audioPlayer.src = url;
  audioPlayer.play();
}
