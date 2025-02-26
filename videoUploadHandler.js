import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Configure Filebase S3
const s3 = new S3Client({
  endpoint: "https://s3.filebase.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.FILEBASE_ACCESS_KEY,
    secretAccessKey: process.env.FILEBASE_SECRET_KEY,
  },
});

// Multer storage in memory (no temp file creation)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max size
  },
});

// Function to set up the upload route
export default function setupUploadRoute(app) {
  app.post("/upload", upload.single("video"), async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded." });
      }

      console.log("Uploaded File:", req.file); // Log the uploaded file details

      const fileKey = `${Date.now()}-${req.file.originalname}`;
      const params = {
        Bucket: process.env.FILEBASE_BUCKET_NAME,
        Key: fileKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      };

      console.log("Uploading to Filebase with params:", params); // Log the upload parameters

      await s3.send(new PutObjectCommand(params));
      res.json({ success: true, fileKey });
    } catch (error) {
      console.error("Upload error:", error);
      res
        .status(500)
        .json({
          success: false,
          error: error.message || "Internal Server Error",
        });
    }
  });
}
