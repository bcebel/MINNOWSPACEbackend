import multer from "multer";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import createTorrent from "create-torrent";
import WebTorrent from "webtorrent";
import dotenv from "dotenv";
import { PinataSDK } from "pinata-web3";

dotenv.config();

const FILEBASE_ACCESS_KEY = process.env.FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.FILEBASE_SECRET_KEY;
const FILEBASE_BUCKET_NAME = process.env.FILEBASE_BUCKET_NAME;
const PINATA_JWT = process.env.PINATA_JWT;

// Initialize the Pinata SDK
const pinata = new PinataSDK({
  pinataJwt: PINATA_JWT, // Use your JWT from the environment variable
  pinataGateway: "gateway.pinata.cloud", // Default gateway domain
});

// Function to calculate CID using Pinata's API
async function calculateCID(fileBuffer, fileName) {
  try {
    console.log("Uploading file to Pinata:", fileName);

    // Create a file-like object from the buffer
    const file = new Blob([fileBuffer], { type: "application/octet-stream" });

    // Upload the file using the Pinata SDK
    const uploadResponse = await pinata.upload.file(file, { name: fileName });
    console.log("Upload response:", uploadResponse);

    return uploadResponse.IpfsHash; // CID of the uploaded file
  } catch (error) {
    console.error("Error calculating CID:", error.message);
    throw new Error("Failed to calculate CID");
  }
}

export default (app) => {
  const uploadHandler = multer({ storage: multer.memoryStorage() }).single(
    "video"
  );

  async function handleUpload(req, res) {
    if (!req.file) {
      return res.status(400).send("No file uploaded.");
    }

    try {
      // Calculate CID using Pinata
      const cid = await calculateCID(req.file.buffer, req.file.originalname);

      // Upload file to Filebase S3
      const s3 = new S3Client({
        endpoint: "https://s3.filebase.com",
        region: "us-east-1",
        credentials: {
          accessKeyId: FILEBASE_ACCESS_KEY,
          secretAccessKey: FILEBASE_SECRET_KEY,
        },
      });

      const params = {
        Bucket: FILEBASE_BUCKET_NAME,
        Key: cid,
        Body: req.file.buffer,
      };

      await s3.send(new PutObjectCommand(params));
      const ipfsUrl = `https://ipfs.filebase.io/ipfs/${cid}`;

      // Save the file permanently for seeding
      const permanentFilePath = path.join(
        process.cwd(),
        "uploads",
        `${cid}.mp4`
      );
      fs.writeFileSync(permanentFilePath, req.file.buffer);

      // Create a torrent file
      createTorrent(
        permanentFilePath,
        {
          announce: [
            "wss://tracker.openwebtorrent.com",
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://tracker.internetwarriors.net:1337/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://tracker.coppersurfer.tk:6969/announce",
          ],
        },
        (err, torrent) => {
          if (err) {
            console.error(err);
            return res.status(500).send("Torrent creation failed.");
          }

          // Seed the torrent
          const client = new WebTorrent();
          client.seed(
            permanentFilePath,
            {
              announce: [
                "wss://tracker.openwebtorrent.com",
                "udp://tracker.opentrackr.org:1337/announce",
                "udp://tracker.internetwarriors.net:1337/announce",
                "udp://tracker.torrent.eu.org:451/announce",
                "udp://tracker.coppersurfer.tk:6969/announce",
              ],
            },
            (torrentData) => {
              console.log(
                "Torrent seeded successfully:",
                torrentData.magnetURI
              );

              // Respond with IPFS URL and magnet link
              res.json({ ipfsUrl, magnetLink: torrentData.magnetURI });
            }
          );
        }
      );
    } catch (error) {
      console.error(error);
      res.status(500).send("Upload failed.");
    }
  }

  app.post("/upload", uploadHandler, handleUpload);
};
