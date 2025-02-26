import multer from "multer";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { create } from "ipfs-http-client";

// Configuration
const FILEBASE_ACCESS_KEY = process.env.FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.FILEBASE_SECRET_KEY;
const FILEBASE_BUCKET_NAME = process.env.FILEBASE_BUCKET_NAME;

// Initialize AWS S3 client for Filebase
const s3 = new S3Client({
  endpoint: "https://s3.filebase.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: FILEBASE_ACCESS_KEY,
    secretAccessKey: FILEBASE_SECRET_KEY,
  },
});
const upload = multer({
  limits: {
    fieldSize: 50 * 1024 * 1024, // 50MB (adjust as needed)
  },
});
// Calculate CID locally
async function calculateCID(filePath) {
  const ipfs = create({ url: "https://ipfs.infura.io:5001/api/v0" }); // Or another public IPFS API
  const fileContent = fs.readFileSync(filePath);
  const result = await ipfs.add(fileContent, { onlyHash: true });
  return result.cid.toString();
}



// Export a function to set up the upload route
export default function setupVideoUploadRoute(app) {
  app.post("/upload", upload.any(), async (req, res) => {
    try {
      if (req.files && req.files.length > 0) {
        // Handle file upload (native)
        const filePath = req.files[0].path;
        // ... (your existing file upload logic) ...
      } else if (req.body.video) {
        // Handle base64 upload (web)
        const base64Data = req.body.video;
        const fileName = req.body.name;
        const fileType = req.body.type;
        const buffer = Buffer.from(base64Data.split(",")[1], "base64");
        const tempFilePath = path.join("uploads", fileName);
        fs.writeFileSync(tempFilePath, buffer);

        const cid = await calculateCID(tempFilePath);

        // Upload file to Filebase
        const params = {
          Bucket: FILEBASE_BUCKET_NAME,
          Key: cid,
          Body: buffer,
        };
        const command = new PutObjectCommand(params);
        await s3.send(command);

        // Clean up temporary file
        fs.unlinkSync(tempFilePath);

        res.json({ success: true, cid });
      } else {
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded." });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}