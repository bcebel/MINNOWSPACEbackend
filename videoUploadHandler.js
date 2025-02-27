import multer from "multer";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import createTorrent from "create-torrent";
import WebTorrent from "webtorrent";
import { create } from "ipfs-http-client";
import dotenv from "dotenv";

dotenv.config();

const FILEBASE_ACCESS_KEY = process.env.FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.FILEBASE_SECRET_KEY;
const FILEBASE_BUCKET_NAME = process.env.FILEBASE_BUCKET_NAME;

async function calculateCID(fileBuffer) {
  const ipfs = create();
  const result = await ipfs.add(fileBuffer, { onlyHash: true });
  return result.cid.toString();
}

export default (app) => {
  // Export a function that accepts app
  const uploadHandler = multer({ storage: multer.memoryStorage() }).single(
    "video"
  );

  async function handleUpload(req, res) {
    if (!req.file) {
      return res.status(400).send("No file uploaded.");
    }

    try {
      const cid = await calculateCID(req.file.buffer);

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

      const tempFilePath = path.join(process.cwd(), `${cid}.mp4`);
      fs.writeFileSync(tempFilePath, req.file.buffer);

      createTorrent(
        tempFilePath,
        { announce: ["wss://tracker.openwebtorrent.com"] },
        (err, torrent) => {
          if (err) {
            console.error(err);
            return res.status(500).send("Torrent creation failed.");
          }
          const client = new WebTorrent();
          client.seed(
            tempFilePath,
            { announce: ["wss://tracker.openwebtorrent.com"] },
            (torrentData) => {
              fs.unlinkSync(tempFilePath);
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
