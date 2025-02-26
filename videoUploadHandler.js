import multer from "multer";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
    fileSize: 100 * 1024 * 1024, // 100 MB (adjust as needed)
  },
});

// Ensure the 'uploads' directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Export a function to set up the upload route
export default function setupVideoUploadRoute(app) {
  app.post("/upload", upload.single("video"), async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded." });
      }

      const filePath = req.file.path; // Path to the uploaded file

      // Generate a unique key for the file
      const fileKey = `${Date.now()}-${req.file.originalname}`;

      // Upload file to Filebase
      const fileContent = fs.readFileSync(filePath);
      const params = {
        Bucket: FILEBASE_BUCKET_NAME,
        Key: fileKey,
        Body: fileContent,
      };
      const command = new PutObjectCommand(params);
      await s3.send(command);

      // Clean up temporary file
      fs.unlinkSync(filePath);

      res.json({ success: true, fileKey });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
