// Import Pinata SDK (if using Node.js or bundlers like Webpack)
// For browser environments, include the Pinata SDK via <script> tag
import { PinataSDK } from "pinata-web3";

// Initialize Pinata SDK
const pinata = new PinataSDK({
  pinataJwt: "YOUR_PINATA_JWT", // Replace with your actual JWT
  pinataGateway: "example-gateway.mypinata.cloud", // Replace with your dedicated gateway domain
});

// Load the WebTorrent library
const client = new WebTorrent();

// Select HTML elements
const galleryContainer = document.getElementById("videoGallery");
const statusElement = document.createElement("div");
document.body.appendChild(statusElement);

// Fetch videos from the backend
async function fetchVideos() {
  try {
    const response = await fetch(
      "https://minnowspacebackend-e6635e46c3d0.herokuapp.com/api/videos"
    );
    const videos = await response.json();
    return videos;
  } catch (error) {
    console.error("Error fetching videos:", error);
    return [];
  }
}

// Populate the video gallery
function populateVideoGallery(videos) {
  galleryContainer.innerHTML = ""; // Clear existing content

  videos.forEach((video) => {
    const videoCard = document.createElement("div");
    videoCard.style.border = "1px solid #ccc";
    videoCard.style.padding = "10px";
    videoCard.style.marginBottom = "20px";

    videoCard.innerHTML = `
      <h3>${video.title}</h3>
      <p>Uploaded by: ${video.user.username}</p>
      <p>${video.description || "No description"}</p>
      <button onclick="playMagnet('${video.magnetLink}', '${
      video.cid
    }')">Play</button>
    `;

    galleryContainer.appendChild(videoCard);
  });
}

// Play video via WebTorrent or fallback to IPFS
function playMagnet(magnetLink, cid) {
  const ipfsUrl = `https://${pinata.pinataGateway}/ipfs/${cid}`;
  statusElement.textContent = "Starting download...";

  if (!client) {
    client = new WebTorrent();
  }

  client.add(magnetLink, (torrent) => {
    console.log("Client is downloading:", torrent.infoHash);

    const file = torrent.files.find(
      (file) =>
        file.name.endsWith(".mp4") ||
        file.name.endsWith(".mkv") ||
        file.name.endsWith(".webm")
    );

    if (!file) {
      statusElement.textContent =
        "No video file found in torrent. Falling back to IPFS.";
      fallbackToIpfs(ipfsUrl);
      return;
    }

    const video = document.createElement("video");
    video.controls = true;
    video.style.width = "100%";
    document.body.appendChild(video);

    const fileStream = file.createReadStream();
    const fileType = file.name.split(".").pop();
    const mimeType = `video/${fileType}`;

    const mediaSource = new MediaSource();
    video.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener("sourceopen", () => {
      console.log("MediaSource opened");
      const sourceBuffer = mediaSource.addSourceBuffer(mimeType);

      fileStream.on("data", (chunk) => {
        console.log("Received chunk:", chunk.length, "bytes");

        try {
          if (!sourceBuffer.updating) {
            sourceBuffer.appendBuffer(chunk);
          }
        } catch (e) {
          console.error("Error appending buffer:", e);
        }
      });

      torrent.on("download", () => {
        const progress = (torrent.progress * 100).toFixed(1);
        statusElement.textContent = `Download Progress: ${progress}%`;
      });
    });

    mediaSource.addEventListener("error", (e) => {
      console.error("MediaSource error:", e);
      fallbackToIpfs(ipfsUrl);
    });
  });
}

// Fallback to IPFS gateway
function fallbackToIpfs(ipfsUrl) {
  const video = document.createElement("video");
  video.controls = true;
  video.style.width = "100%";
  video.src = ipfsUrl;
  document.body.appendChild(video);
  video.play().catch((err) => {
    console.error("Failed to play video from IPFS gateway:", err);
  });
}

// Populate the gallery on page load
document.addEventListener("DOMContentLoaded", async () => {
  const videos = await fetchVideos();
  populateVideoGallery(videos);
});
