// Load the WebTorrent library
const client = new WebTorrent();

// Select HTML elements
const magnetLinkInput = document.getElementById("magnetLink");
const playMagnetButton = document.getElementById("playMagnetButton");

// Keep track of the video container
let videoContainer = null;

// Handle playing from a magnet link
playMagnetButton.addEventListener("click", () => {
  const magnetLink = magnetLinkInput.value.trim();

  if (!magnetLink) {
    alert("Please enter a valid magnet link.");
    return;
  }

  // Check if the torrent already exists
  if (client.get(magnetLink)) {
    alert("Torrent already added. Please wait or refresh.");
    return;
  }

  // Clear any existing video container
  if (videoContainer) {
    document.body.removeChild(videoContainer);
    videoContainer = null;
  }

  // Add the torrent
  client.add(
    magnetLink,
    {
      announce: [
        "wss://tracker.openwebtorrent.com",
        "wss://tracker.btorrent.xyz",
        "wss://tracker.fastcast.nz", // You can remove this if it's always down
      ],
    },
    (torrent) => {
      console.log("Torrent info hash:", torrent.infoHash);
      alert("Magnet download started!");

      // Stream the first MP4 file
      torrent.files.forEach((file) => {
        if (file.name.endsWith(".mp4")) {
          // Create a new video container
          videoContainer = document.createElement("div");
          document.body.appendChild(videoContainer);

          // Append the video to the container
          file.appendTo(videoContainer, (err) => {
            if (err) {
              console.error("Error appending file:", err);
            } else {
              console.log("Video is now playing.");
            }
          });
        }
      });
    }
  );
});
