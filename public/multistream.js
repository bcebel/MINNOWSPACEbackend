// Load the WebTorrent library
const client = new WebTorrent();

// Select HTML elements
const magnetLinkInput = document.getElementById("magnetLink");
const playMagnetButton = document.getElementById("playMagnetButton");
const statusElement = document.createElement("div");
document.body.appendChild(statusElement);

// Handle playing from a magnet link
playMagnetButton.addEventListener("click", () => {
  const magnetLink = magnetLinkInput.value.trim();

  if (!magnetLink) {
    alert("Please enter a valid magnet link.");
    return;
  }

  statusElement.textContent = "Starting download...";

  client.add(magnetLink, (torrent) => {
    // Log initial connection
    console.log("Client is downloading:", torrent.infoHash);

    // Find the video file
    const file = torrent.files.find(
      (file) =>
        file.name.endsWith(".mp4") ||
        file.name.endsWith(".mkv") ||
        file.name.endsWith(".webm")
    );

    if (!file) {
      statusElement.textContent = "No video file found in torrent";
      return;
    }

    // Create video element
    const video = document.createElement("video");
    video.controls = true;
    video.style.width = "100%";
    document.body.appendChild(video);

    // Create file stream
    const fileStream = file.createReadStream();
    console.log("Created file stream");

    // Get the file type
    const fileType = file.name.split(".").pop();
    const mimeType = `video/${fileType}`;

    // Create media source
    const mediaSource = new MediaSource();
    video.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener("sourceopen", () => {
      console.log("MediaSource opened");
      const sourceBuffer = mediaSource.addSourceBuffer(mimeType);

      // Handle data chunks
      fileStream.on("data", (chunk) => {
        // Log the chunk size
        console.log("Received chunk:", chunk.length, "bytes");

        try {
          if (!sourceBuffer.updating) {
            sourceBuffer.appendBuffer(chunk);
          }
        } catch (e) {
          console.error("Error appending buffer:", e);
        }
      });

      // Update status with progress
      torrent.on("download", () => {
        const progress = (torrent.progress * 100).toFixed(1);
        statusElement.textContent = `Download Progress: ${progress}%`;
      });
    });

    mediaSource.addEventListener("error", (e) => {
      console.error("MediaSource error:", e);
    });
  });
});
