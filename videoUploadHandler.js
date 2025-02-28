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
const INFURA_ENDPOINT = process.env.INFURA_ENDPOINT; // e.g., "https://ipfs.infura.io:5001/api/v0"
const INFURA_API_KEY = process.env.INFURA_API_KEY;
const INFURA_SECRET_KEY = process.env.INFURA_SECRET_KEY;

// Function to calculate CID using Infura's IPFS API
async function calculateCID(fileBuffer) {
  const auth =
    "Basic " +
    Buffer.from(`${INFURA_API_KEY}:${INFURA_SECRET_KEY}`).toString("base64");

  const ipfs = create({
    url: INFURA_ENDPOINT,
    headers: {
      authorization: auth,
    },
  });

  try {
    const result = await ipfs.add(fileBuffer, { onlyHash: true });
    return result.cid.toString();
  } catch (error) {
    console.error("Error calculating CID:", error);
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
      // Calculate CID using Infura
      const cid = await calculateCID(req.file.buffer);

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

      // Create a temporary file for torrent creation
      const tempFilePath = path.join(process.cwd(), `${cid}.mp4`);
      fs.writeFileSync(tempFilePath, req.file.buffer);

      // Create a torrent file
      createTorrent(
        tempFilePath,
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
            tempFilePath,
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
              // Clean up the temporary file
              fs.unlinkSync(tempFilePath);

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
