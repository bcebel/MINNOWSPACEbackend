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
    limits: { fileSize: 50 * 1024 * 1024 },
  }).single("video");

  async function handleUpload(req, res) {
    console.log("📥 Upload request received:", {
      user: req.user?.userId,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      contentType: req.file?.mimetype,
      body: req.body,
    });

    const {
      title,
      description,
      neighborhoodId,
      isThumbnail,
      originalFileName,
    } = req.body;
    const uid = req.user?.userId;

    if (!uid) {
      return res.status(400).send("UID is required.");
    }

    if (!req.file) {
      return res.status(400).send("No file uploaded.");
    }

    try {
      const fileType = getFileType(req.file.mimetype, req.file.originalname);
      const isImage = fileType === "image";
      const isVideo = fileType === "video";

      console.log("📊 File analysis:", { fileType, isImage, isVideo });

      let cid, ipfsUrl;

      // DECIDE WHICH SERVICE TO USE BASED ON ENV VARS
      const usePinata = !!PINATA_JWT;
      const useFilebase = !!(
        FILEBASE_ACCESS_KEY &&
        FILEBASE_SECRET_KEY &&
        FILEBASE_BUCKET_NAME
      );

      if (usePinata) {
        console.log("🔄 Using Pinata for IPFS upload");
        const result = await uploadToPinata(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );
        cid = result.cid;
        ipfsUrl = result.ipfsUrl;
      } else if (useFilebase) {
        console.log("🔄 Using Filebase for IPFS upload");
        const result = await uploadToFilebase(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );
        cid = result.cid;
        ipfsUrl = result.ipfsUrl;
      } else {
        throw new Error(
          "No IPFS service configured. Set either PINATA_JWT or FILEBASE credentials."
        );
      }

      console.log("✅ IPFS Upload Complete:", { cid, ipfsUrl });

      // Save file locally for torrent creation
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const permanentFilePath = path.join(
        uploadsDir,
        `${cid}_${req.file.originalname}`
      );
      fs.writeFileSync(permanentFilePath, req.file.buffer);

      // Create torrent
      const webseedUrls = [
        `https://${PINATA_GATEWAY}/ipfs/${cid}`, // Primary - fastest for you
        ...PUBLIC_GATEWAYS.map((gw) => `${gw}${cid}`), // Secondary backups for racing/caching
      ];

      // ... inside createTorrent callback ...
      createTorrent(
        permanentFilePath,
        {
          announce,
          urlList: webseedUrls,
          private: false,
        },
        async (err, torrent) => {
          if (err) {
            console.error("❌ Torrent creation failed:", err);
            return res.status(500).send("Torrent creation failed.");
          }

          try {
            // 🚀 SWAP: Instead of client.seed(), call your booster
            // This uses your optimized, persistent WebTorrent instance
            const magnetLink = await reactiveBooster.boostChunkIfNeeded(
              permanentFilePath,
              `gallery-${cid}`, // Unique ID for the booster map
              announce
            );

            console.log("✅ Torrent boosted via Service:", magnetLink);

            // --- START YOUR EXISTING LOGIC ---
            // We just use the 'magnetLink' variable we just got back
      
            if (isThumbnail === "true" || isThumbnail === true) {
              console.log("📸 Saving thumbnail for video:", originalFileName);
              const newImage = new Image({
                title: title || req.file.originalname,
                description: description || "Thumbnail",
                user: uid,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                fileType: "image",
                mimetype: req.file.mimetype,
                cid,
                ipfsUrl,
                magnetLink: magnetLink, // 🎯 Use the boosted link
                strategy: "rarest",
                neighborhood: neighborhoodId || null,
                isThumbnail: true,
                videoId: null,
                originalVideoFileName: originalFileName,
              });

              await newImage.save();
              return res.json({
                ipfsUrl,
                magnetLink: magnetLink,
                fileType: "image",
                isThumbnail: true,
                videoId: null,
                neighborhoodId: neighborhoodId || null,
              });

            } else if (isImage) {
              const newImage = new Image({
                title: title || req.file.originalname,
                description: description || "",
                user: uid,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                fileType: "image",
                mimetype: req.file.mimetype,
                cid,
                ipfsUrl,
                magnetLink: magnetLink, // 🎯 Use the boosted link
                strategy: "rarest",
                neighborhood: neighborhoodId || null,
                isThumbnail: false,
              });

              await newImage.save();
              return res.json({
                ipfsUrl,
                magnetLink: magnetLink,
                fileType: "image",
                strategy: "rarest",
                neighborhoodId: neighborhoodId || null,
              });

            } else {
              const newVideo = new Video({
                title: title || req.file.originalname,
                description: description || "",
                user: uid,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                fileType: fileType,
                mimetype: req.file.mimetype,
                cid,
                ipfsUrl,
                magnetLink: magnetLink, // 🎯 Use the boosted link
                strategy: isVideo ? "sequential" : "rarest",
                videoMetadata: isVideo ? { hasFastStart: req.file.originalname.toLowerCase().endsWith(".mp4") } : null,
                neighborhood: neighborhoodId || null,
              });

              await newVideo.save();
              return res.json({
                ipfsUrl,
                magnetLink: magnetLink,
                fileType: fileType,
                strategy: isVideo ? "sequential" : "rarest",
                optimizedFor: isVideo ? "streaming" : "quick load",
                neighborhoodId: neighborhoodId || null,
              });
            }
            // --- END YOUR EXISTING LOGIC ---

          } catch (boostError) {
            console.error("❌ Seeding/Database error:", boostError);
            res.status(500).send("Failed to save media metadata.");
          }
        }
      );
    }
    catch (error) {
      console.error("❌ Upload error:", error);
      res.status(500).send(`Upload failed: ${error.message}`);
    }
  }



  app.post("/upload", authenticateUser, uploadHandler, handleUpload);
};
