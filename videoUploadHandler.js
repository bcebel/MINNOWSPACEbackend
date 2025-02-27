import multer from "multer";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { create } from "ipfs-http-client"
import dotenv from "dotenv";
dotenv.config();

const upload = multer({ dest: "uploads/" });

// Filebase Configuration
const s3 = new S3Client({
  endpoint: "https://s3.filebase.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.FILEBASE_ACCESS_KEY,
    secretAccessKey: process.env.FILEBASE_SECRET_KEY,
  },
});
const FILEBASE_BUCKET_NAME = process.env.FILEBASE_BUCKET_NAME;

async function calculateCID(filePath) {
  const ipfs = create({ url: "https://ipfs.infura.io:5001/api/v0" });
  const fileContent = fs.readFileSync(filePath);
  const result = await ipfs.add(fileContent, { onlyHash: true });
  return result.cid.toString();
}

export default function setupUploadRoute(app) {
  app.post("/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      const filePath = req.file.path;
      const cid = await calculateCID(filePath);

      const fileContent = fs.readFileSync(filePath);
      const params = {
        Bucket: FILEBASE_BUCKET_NAME,
        Key: cid,
        Body: fileContent,
      };
      const command = new PutObjectCommand(params);
      await s3.send(command);

      fs.unlinkSync(filePath);

      res.json({ cid });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });
};
