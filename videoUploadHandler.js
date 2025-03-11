import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import createTorrent from "create-torrent";
import WebTorrent from "webtorrent";
import dotenv from "dotenv";
import { PinataSDK } from "pinata-web3";
import Video from "./structure/models/Video.js";
import cors from "cors"; // Add this

dotenv.config();

const FILEBASE_ACCESS_KEY = process.env.FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.FILEBASE_SECRET_KEY;
const FILEBASE_BUCKET_NAME = process.env.FILEBASE_BUCKET_NAME;
const PINATA_JWT = process.env.PINATA_JWT;

//auth middleware
export const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send("Unauthorized: Missing or invalid token.");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach the decoded user data to the request object
    next(); // Proceed to the next middleware/route handler
  } catch (error) {
    console.error(error);
    return res.status(401).send("Unauthorized: Invalid token.");
  }
};

// Initialize the Pinata SDK
const pinata = new PinataSDK({
  pinataJwt: PINATA_JWT, // Use your JWT from the environment variable
  pinataGateway: "gateway.pinata.cloud", // Default gateway domain
});

// Function to calculate CID using Pinata's API
async function calculateCID(fileBuffer, fileName) {
  try {
    console.log("Uploading file to Pinata:", fileName);

    // Create a File object from the buffer
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
    const { title, description } = req.body;
    const uid = req.user.id; // Extract the user's ID from the authenticated request
    if (!uid) {
      return res.status(400).send("UID is required.");
    }

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
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const permanentFilePath = path.join(uploadsDir, `${cid}.mp4`);
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
        async (err, torrent) => {
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
            async (torrentData) => {
              console.log(
                "Torrent seeded successfully:",
                torrentData.magnetURI
              );

              // Save video metadata to MongoDB
              const newVideo = new Video({
                title: title || "Untitled Video",
                description: description || "",
                user: uid,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                fileType: req.file.mimetype,
                cid,
                ipfsUrl,
                magnetLink: torrentData.magnetURI,
              });
              await newVideo.save();

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

  app.post("/upload", authenticateUser, uploadHandler, handleUpload);
};
