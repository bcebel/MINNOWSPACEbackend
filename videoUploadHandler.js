import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import createTorrent from "create-torrent";
import WebTorrent from "webtorrent";
import dotenv from "dotenv";
import axios from "axios";
import FormData from "form-data";
import Video from "./structure/models/Video.js";
import Image from "./structure/models/Image.js";
import { reactiveBooster } from "./seedService.js";
dotenv.config();

const announce = [
  "wss://tracker-0ad4cca9fd92.herokuapp.com",
  "wss://tracker.files.fm:7073/announce",
  "wss://tracker.webtorrent.dev",
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
  "wss://tracker.files.fm:7073",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://9.rarbg.to:2710/announce",
  "udp://tracker.coppersurfer.tk:6969/announce",
  "udp://tracker.leechers-paradise.org:6969/announce",
  "udp://tracker.internetwarriors.net:1337/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.moeking.me:6969/announce",
  "udp://opentor.org:2710/announce",
  "udp://tracker.cyberia.is:6969/announce",
  "udp://tracker3.itzmx.com:6961/announce",
];

const FILEBASE_ACCESS_KEY = process.env.FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.FILEBASE_SECRET_KEY;
const FILEBASE_BUCKET_NAME = process.env.FILEBASE_BUCKET_NAME;
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY;
const PUBLIC_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://gateway.pinata.cloud/ipfs/", // extra Pinata public as backup
];

const getFileType = (mimetype, originalname) => {
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("audio/")) return "audio";

  const ext = originalname.split(".").pop().toLowerCase();
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "avif"].includes(ext))
    return "image";
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";

  return "file";
};

export const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send("Unauthorized: Missing or invalid token.");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error(error);
    return res.status(401).send("Unauthorized: Invalid token.");
  }
};

// Upload to Pinata
async function uploadToPinata(fileBuffer, fileName, mimeType) {
  try {
    console.log("📤 Uploading to Pinata:", fileName);

    const formData = new FormData();
    formData.append("file", fileBuffer, {
      filename: fileName,
      contentType: mimeType,
    });

    const metadata = JSON.stringify({ name: fileName });
    formData.append("pinataMetadata", metadata);

    const pinataOptions = JSON.stringify({ cidVersion: 0 });
    formData.append("pinataOptions", pinataOptions);

    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${PINATA_JWT}`,
        },
      }
    );

    const cid = response.data.IpfsHash;
    const ipfsUrl = `https://${PINATA_GATEWAY}/ipfs/${cid}`;

    console.log("✅ Pinata upload successful:", { cid, ipfsUrl });
    return { cid, ipfsUrl };
  } catch (error) {
    console.error(
      "❌ Pinata upload error:",
      error.response?.data || error.message
    );
    throw new Error(`Pinata upload failed: ${error.message}`);
  }
}

// Upload to Filebase
async function uploadToFilebase(fileBuffer, fileName, mimeType) {
  try {
    console.log("📤 Uploading to Filebase:", fileName);

    const s3 = new S3Client({
      endpoint: "https://s3.filebase.com",
      region: "us-east-1",
      credentials: {
        accessKeyId: FILEBASE_ACCESS_KEY,
        secretAccessKey: FILEBASE_SECRET_KEY,
      },
    });

    // Create a unique key with timestamp
    const timestamp = Date.now();
    const key = `${timestamp}_${fileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    const params = {
      Bucket: FILEBASE_BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      Metadata: {
        originalname: fileName,
      },
    };

    await s3.send(new PutObjectCommand(params));

    // Filebase automatically pins to IPFS, but we need to get the CID
    // Note: Filebase doesn't return CID in response headers for S3 uploads
    // You might need to use their IPFS API to get the CID
    const cid = key; // This is a placeholder - Filebase S3 doesn't give CID directly

    // Try to get the CID from Filebase IPFS API
    try {
      // This is how you'd get the CID from Filebase after S3 upload
      // You need to list objects and find the CID
      const ipfsUrl = `https://ipfs.filebase.io/ipfs/${cid}`;
      console.log("✅ Filebase upload successful (S3 mode)");
      return { cid, ipfsUrl };
    } catch (ipfsError) {
      console.log(
        "⚠️ Could not get CID from Filebase, using S3 key as reference"
      );
      const ipfsUrl = `https://${FILEBASE_BUCKET_NAME}.s3.filebase.com/${key}`;
      return { cid: key, ipfsUrl };
    }
  } catch (error) {
    console.error("❌ Filebase upload error:", error);
    throw new Error(`Filebase upload failed: ${error.message}`);
  }
}


export default (app) => {
  const uploadHandler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // Increased limit for slicing
  }).single("video");

  async function handleUpload(req, res) {
    const { title, description, neighborhoodId } = req.body;
    const uid = req.user?.userId;
    const SLICE_SIZE = 5 * 1024 * 1024; // 🎯 5MB manageable slices

    if (!req.file) return res.status(400).send("No file uploaded.");

    try {
      const fullBuffer = req.file.buffer;
      const totalSlices = Math.ceil(fullBuffer.length / SLICE_SIZE);
      const sliceRecords = [];

      console.log(`🔪 Slicing ${req.file.originalname} into ${totalSlices} pieces...`);

      for (let i = 0; i < totalSlices; i++) {
        const start = i * SLICE_SIZE;
        const end = Math.min(start + SLICE_SIZE, fullBuffer.length);
        const chunkBuffer = fullBuffer.slice(start, end);

        // 1. Upload Slice to IPFS (using your existing Pinata logic)
        // Note: For speed, you could only upload slice 0 to Pinata 
        // and keep others on Heroku/Local, but let's keep it simple for now.
        const { cid, ipfsUrl } = await uploadToPinata(
          chunkBuffer, 
          `slice-${i}-${req.file.originalname}`, 
          req.file.mimetype
        );

        // 2. Create Torrent for this slice
        const magnetLink = await new Promise((resolve, reject) => {
          createTorrent(chunkBuffer, { announce, name: `slice-${i}` }, async (err, torrentBuf) => {
            if (err) return reject(err);
            // Boost via your SeedService
            const mLink = await reactiveBooster.boostChunkIfNeeded(
              chunkBuffer, 
              `gallery-${cid}`, 
              announce
            );
            resolve(mLink);
          });
        });

        sliceRecords.push({
          index: i,
          cid: cid,
          magnetLink: magnetLink,
          size: chunkBuffer.length
        });
        
        console.log(`✅ Slice ${i} complete.`);
      }

      // 3. Save the Master Video Document
      const newVideo = new Video({
        title: title || req.file.originalname,
        description,
        user: uid,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: "video",
        cid: sliceRecords[0].cid, // Master CID is the first slice
        ipfsUrl: `https://${PINATA_GATEWAY}/ipfs/${sliceRecords[0].cid}`,
        magnetLink: sliceRecords[0].magnetLink,
        neighborhood: neighborhoodId || null,
        isSliced: true,
        slices: sliceRecords, // 🚀 THE DATASET FOR YOUR FRONTEND
      });

      await newVideo.save();

      res.json({
        success: true,
        videoId: newVideo._id,
        totalSlices: totalSlices,
        slices: sliceRecords
      });

    } catch (error) {
      console.error("❌ Slicing failed:", error);
      res.status(500).send(`Slicing failed: ${error.message}`);
    }
  }

  app.post("/upload", authenticateUser, uploadHandler, handleUpload);
};
