const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const createTorrent = require("create-torrent");
const WebTorrent = require("webtorrent");
const { create } = require("ipfs-http-client");
require("dotenv").config();

const FILEBASE_ACCESS_KEY = process.env.FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.FILEBASE_SECRET_KEY;
const FILEBASE_BUCKET_NAME = process.env.FILEBASE_BUCKET_NAME;

async function calculateCID(fileBuffer) {
  const ipfs = create();
  const result = await ipfs.add(fileBuffer, { onlyHash: true });
  return result.cid.toString();
}

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

    const tempFilePath = path.join(__dirname, `${cid}.mp4`);
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

module.exports = { uploadHandler, handleUpload };
