import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import jwt from "jsonwebtoken";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import  pubsub from "./structure/pubsub.js";
import { Server } from "socket.io";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/use/ws";

import typeDefs from "./structure/typedefs/typedefs.js";
import ModelSchema from "./structure/models/index.js";
import mutationResolvers from "./structure/resolvers/mutations/mutations.js";
//import subscriptionResolvers from "./structure/resolvers/subscriptions/subscriptions.js";
import connectDB from "./config/connection.js";
import videoUploadHandler from "./videoUploadHandler.js";
import Video from "./structure/models/Video.js";
import Image from "./structure/models/Image.js";
import Neighborhood from "./structure/models/Neighborhood.js";
import MediaAPI from "./datasources/MediaAPI.cjs";

import { reactiveBooster } from "./seedService.js";
import fs from "fs";
import StreamChunk from "./structure/models/StreamChunk.js";
import Stream from "./structure/models/Stream.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
// In index.js, instead of importing subscriptions.js
const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      // Use the 'subscribe' property correctly
      subscribe: (_, { sessionId }) => {
        const channel = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;
        console.log(`📡 Attempting subscription to: ${channel}`);

        // Debug: Check if pubsub exists and what methods it has
        if (!pubsub) {
          console.error("🔴 PubSub is undefined!");
        } else {
          console.log("🛠 PubSub keys:", Object.keys(pubsub));
        }

        return pubsub.asyncIterableIterator(channel);
      },
    },
  },
};
/*
const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? [
          "https://shiny-space-memory-w6g6755pp5jhgv69-8081.app.github.dev",
          "https://bubblebase.app",
          "https://gigunit.com",
          "https://gigunit.vercel.app",
          "https://studio.apollographql.com",
        "https://studio.apollographql.dev",
          "http://192.168.1.234:8081",
          "http://localhost:3001",
          "http://localhost:8081",
          "http://127.0.0.1:5501",
          "http://localhost:19006",
          "exp://localhost:19000",
        ]
      : [
          "https://shiny-space-memory-w6g6755pp5jhgv69-8081.app.github.dev",
          "https://studio.apollographql.com",
          "https://bubblebase.app",
          "https://gigunit.com",
          "https://gigunit.vercel.app",
          "http://localhost:3001",
          "http://localhost:3001/graphql",
          "http://localhost:8081",
          "http://localhost:8081/",
          "http://127.0.0.1:5501",
        ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  exposedHeaders: ["Content-Length", "X-Powered-By"],
  maxAge: 86400,
};
*/
const corsOptions = {
  // Allow any origin during this testing phase
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  exposedHeaders: ["Content-Length", "X-Powered-By"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY;

connectDB();

// Import models
import Minnow from "./structure/models/User.js";
const User = Minnow;
const Message = ModelSchema.Message;

// ========== IMPORTANT MISSING PIECES FROM OLDEST VERSION ==========

// Helper function for expires header
const getExpiresDate = (maxAgeSeconds) => {
  return new Date(Date.now() + maxAgeSeconds * 1000).toUTCString();
};

// Middleware for Authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// SIMPLE ACCESS CHECK FUNCTION
async function checkPrivateMediaAccess(media, user) {
  if (!user) return false;

  // 1. Owner can always access
  if (media.user && media.user.toString() === user.userId) {
    return true;
  }

  // 2. If media has a neighborhood, check membership
  if (media.neighborhood) {
    const neighborhood = await Neighborhood.findById(media.neighborhood)
      .select("members")
      .lean();

    if (!neighborhood) return false;

    return neighborhood.members.some(
      (member) => member.user.toString() === user.userId
    );
  }

  return false;
}

// ========== REST API ROUTES FROM OLDEST VERSION ==========

// 1. PUBLIC endpoint - NO AUTH, aggressively cached
app.get("/api/media/public/:cid", async (req, res) => {
  const oneWeek = 604800;
  const thirtyDays = 2592000;

  try {
    let media = await Video.findOne({ cid: req.params.cid }).lean();
    let mediaType = "video";

    if (!media) {
      media = await Image.findOne({ cid: req.params.cid }).lean();
      mediaType = "image";
    }

    if (!media) {
      res.set({ "Cache-Control": "public, max-age=3600" });
      return res.status(404).json({ error: "Media not found" });
    }

    // Only serve if media isPublic = true
    if (!media.isPublic) {
      res.set({ "Cache-Control": "no-cache" });
      return res.status(404).json({ error: "Media not found" });
    }

    res.set({
      "Cache-Control": `public, max-age=${oneWeek}, immutable`,
      "CDN-Cache-Control": `public, max-age=${thirtyDays}`,
      Expires: getExpiresDate(thirtyDays),
      Vary: "Accept-Encoding",
    });

    return res.json({
      fileName: media.fileName,
      fileType: media.fileType,
      cid: media.cid,
      magnetLink: media.magnetLink,
      isPublic: true,
      mediaType: mediaType,
    });
  } catch (error) {
    console.error("Public media API error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 2. PRIVATE endpoint - REQUIRES AUTH, user-specific cache
app.get("/api/media/private/:cid", authenticateToken, async (req, res) => {
  try {
    let media = await Video.findOne({ cid: req.params.cid }).lean();
    let mediaType = "video";

    if (!media) {
      media = await Image.findOne({ cid: req.params.cid }).lean();
      mediaType = "image";
    }

    if (!media) {
      res.set({ "Cache-Control": "no-cache" });
      return res.status(404).json({ error: "Media not found" });
    }

    const hasAccess = await checkPrivateMediaAccess(media, req.user);

    if (!hasAccess) {
      res.set({ "Cache-Control": "no-cache" });
      return res.status(403).json({ error: "Access denied" });
    }

    res.set({
      "Cache-Control": `private, max-age=604800, must-revalidate`,
      "CDN-Cache-Control": `private, max-age=604800`,
      Vary: "Accept-Encoding, Authorization",
      Expires: getExpiresDate(604800),
    });

    return res.json({
      fileName: media.fileName,
      fileType: media.fileType,
      cid: media.cid,
      magnetLink: media.magnetLink,
      isPublic: media.isPublic,
      mediaType: mediaType,
    });
  } catch (error) {
    console.error("Private media API error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 3. SMART endpoint - Auto-detects public/private
app.get("/api/media/:cid", async (req, res) => {
  try {
    let user = null;
    const authHeader = req.headers["authorization"];

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        user = { userId: decoded.userId };
      } catch (error) {
        // Invalid token, treat as anonymous
      }
    }

    let media = await Video.findOne({ cid: req.params.cid }).lean();
    let mediaType = "video";

    if (!media) {
      media = await Image.findOne({ cid: req.params.cid }).lean();
      mediaType = "image";
    }

    if (!media) {
      res.set({ "Cache-Control": "public, max-age=3600" });
      return res.status(404).json({ error: "Media not found" });
    }

    // SIMPLE BINARY LOGIC
    if (media.isPublic) {
      // PUBLIC: Anyone can see, aggressive caching
      res.set({
        "Cache-Control": `public, max-age=604800, immutable`,
        "CDN-Cache-Control": `public, max-age=2592000`,
        Vary: "Accept-Encoding",
      });
    } else {
      // PRIVATE: Check access
      const hasAccess = await checkPrivateMediaAccess(media, user);

      if (!hasAccess) {
        res.set({ "Cache-Control": "no-cache" });
        return res.status(403).json({ error: "Access denied" });
      }

      // Private content, user-specific cache
      res.set({
        "Cache-Control": `private, max-age=604800, must-revalidate`,
        "CDN-Cache-Control": `private, max-age=604800`,
        Vary: "Accept-Encoding, Authorization",
      });
    }

    return res.json({
      fileName: media.fileName,
      fileType: media.fileType,
      cid: media.cid,
      magnetLink: media.magnetLink,
      isPublic: media.isPublic,
      mediaType: mediaType,
    });
  } catch (error) {
    console.error("Media API error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ========== MULTER UPLOAD CONFIGURATION ==========
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

// ========== LIVE STREAM CHUNK UPLOAD ==========
// Reuse your multer memoryStorage
const liveChunkUpload = multer({ storage: multer.memoryStorage() });

app.post(
  "/api/live-chunk",
  authenticateToken,
  liveChunkUpload.single("chunk"),
  async (req, res) => {
    console.log("🔵 [LIVE-CHUNK] Endpoint hit. Starting processing...");

    try {
      // 1. DATA EXTRACTION - Use let/const consistently
      const { sessionId, chunkIndex } = req.body;
      const file = req.file;

      // 2. CRITICAL VALIDATION (The 500 Killers)
      if (!file || !file.buffer) {
        console.error("🔴 [LIVE-CHUNK] ERROR: No file buffer found.");
        return res.status(400).json({ success: false, error: "No file data" });
      }
      if (!sessionId) {
        console.error("🔴 [LIVE-CHUNK] ERROR: Missing sessionId.");
        return res
          .status(400)
          .json({ success: false, error: "Missing sessionId" });
      }

      const mimeType = file.mimetype || "video/mp4";
      const indexInt = parseInt(chunkIndex);

      // 3. SEED SERVICE
      const trackers = [
        "wss://tracker.openwebtorrent.com",
        "wss://tracker.webtorrent.dev",
      ];

      // Setup temp file (using buffer directly to avoid fs write if possible,
      // but keeping your temp logic for WebTorrent pathing)
      const tempDir = path.join("/tmp", "live-chunks", sessionId);
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const tempFilePath = path.join(tempDir, `chunk-${indexInt}.${ext}`);
      await fs.promises.writeFile(tempFilePath, file.buffer);

      const magnetUri = await reactiveBooster.boostChunkIfNeeded(
        tempFilePath,
        `${sessionId}-${indexInt}`,
        trackers
      );

      // 4. DATABASE SYNC (The "DeepSeek" Clean Version)
      const parentStream = await Stream.findOne({ sessionId });

      const newChunk = await StreamChunk.create({
        stream: parentStream ? parentStream._id : null,
        sessionId: sessionId, // This links the viewer query
        chunkIndex: indexInt,
        magnetLink: magnetUri,
        fileName: file.originalname || `chunk-${indexInt}.${ext}`,
        fileSize: file.size || 0,
        fileType: indexInt === -1 ? "video_header" : "video_chunk",
        mimeType: mimeType,
      });

      // 5. GRAPHQL PUBLISH
      const publishData = {
        livestreamChunkAdded: {
          id: newChunk.id,
          sessionId: sessionId,
          chunkIndex: newChunk.chunkIndex,
          magnetLink: magnetUri,
          fileName: newChunk.fileName,
          fileSize: newChunk.fileSize,
          fileType: newChunk.fileType,
          mimeType: mimeType,
        },
      };

      pubsub.publish(`LIVESTREAM_CHUNK_ADDED_${sessionId}`, publishData);

      console.log(`✅ [LIVE-CHUNK] Chunk ${indexInt} processed successfully.`);
      return res.json({ success: true, magnetUri, chunkId: newChunk._id });
    } catch (error) {
      console.error("🔴 [LIVE-CHUNK] SERVER ERROR:", error.message);
      // Sending the error message back helps you see the culprit in the browser console
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

app.get("/api/live-chunk/:sessionId/:index", (req, res) => {
  const { sessionId, index } = req.params;
  const tempDir = path.join("/tmp", "live-chunks", sessionId);

  if (!fs.existsSync(tempDir)) return res.status(404).send("Path missing");

  try {
    const files = fs.readdirSync(tempDir);
    // This finds 'chunk-0.mp4' OR 'chunk-0.webm' OR 'chunk--1.mp4'
    const match = files.find((f) => f.startsWith(`chunk-${index}.`));

    if (match) {
      return res.sendFile(path.join(tempDir, match));
    } else {
      // Log exactly what files DO exist so you can see the naming mismatch
      console.log(`DEBUG: Index ${index} not found. Existing files:`, files);
      return res.status(404).send("Not ready");
    }
  } catch (e) {
    res.status(500).send("Error");
  }
});

app.post("/api/stream-end", authenticateToken, async (req, res) => {
  const { sessionId } = req.body;
  await reactiveBooster.stopStreamBoost(sessionId);
  res.json({ success: true, message: `Stopped boosting stream ${sessionId}` });
});

// Simple upload endpoint for testing
app.post(
  "/api/upload-image",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      console.log("Upload request received!:", {
        file: req.file
          ? {
              originalname: req.file.originalname,
              mimetype: req.file.mimetype,
              size: req.file.size,
              hasBuffer: !!req.file.buffer,
            }
          : "NO FILE",
      });

      if (!req.file) {
        console.log("No file in request");
        return res.status(400).json({ error: "No file provided" });
      }

      // For testing - just return a success with test URL
      console.log("File received successfully:", {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
      });

      res.json({
        success: true,
        fileUrl: "https://picsum.photos/200/300", // Test URL
        message: "File received successfully - ready for IPFS integration",
        debug: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          hasBuffer: !!req.file.buffer,
        },
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({
        error: "Failed to upload file",
        details: error.message,
      });
    }
  }
);

// WebTorrent player HTML endpoint
app.get("/api/webtorrent-player", (req, res) => {
  const { fileName, magnetLink, cid, id } = req.query;

  let cleanMagnetLink = decodeURIComponent(magnetLink || "");
  if (cleanMagnetLink.startsWith("magnet:?magnet:")) {
    cleanMagnetLink = cleanMagnetLink.replace("magnet:?magnet:", "magnet:?");
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WebTorrent Player</title>
        <style>
            body { margin: 0; padding: 15px; background: #1a1a1a; color: white; font-family: Arial, sans-serif; }
            .video-card { border: 1px solid #333; padding: 15px; border-radius: 8px; background: #222; max-width: 600px; margin: 0 auto; }
            video { width: 100%; max-height: 400px; background: #000; border-radius: 8px; }
            .status { color: #FFFF00; margin: 10px 0; font-size: 14px; text-align: center; }
            .progress-bar { width: 100%; height: 20px; background: #333; border-radius: 10px; margin: 10px 0; overflow: hidden; }
            .progress-fill { height: 100%; background: linear-gradient(90deg, #00FF00, #00AAFF); transition: width 0.3s; }
            .stats { color: #888; font-size: 12px; text-align: center; margin: 5px 0; }
        </style>
    </head>
    <body>
        <div class="video-card">
            <div style="color: #00FF00; text-align:center; margin-bottom:10px;">🎬 ${
              fileName || "Video"
            }</div>
            <div class="status" id="status">🚀 Starting WebTorrent...</div>
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill" style="width: 0%"></div>
            </div>
            <div class="stats" id="stats">👥 0 peers | 📥 0%</div>
            <video id="videoPlayer" controls style="display:none;"></video>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
        <script>
            const client = new WebTorrent();
            const videoElement = document.getElementById('videoPlayer');
            const statusElement = document.getElementById('status');
            const statsElement = document.getElementById('stats');
            const progressFill = document.getElementById('progressFill');

            ${
              cleanMagnetLink
                ? `
            // WEBTORRENT MODE - Start immediately
            console.log('Starting WebTorrent with:', '${cleanMagnetLink}');
            
            const torrent = client.add('${cleanMagnetLink}');
            let hasStartedPlaying = false;

            torrent.on('ready', () => {
                console.log('Torrent ready');
                statusElement.textContent = '📦 Torrent ready - ' + torrent.files.length + ' files';
            });

            torrent.on('download', (bytes) => {
                const percent = Math.round(torrent.progress * 100);
                progressFill.style.width = percent + '%';
                statsElement.textContent = '👥 ' + torrent.numPeers + ' peers | 📥 ' + percent + '% | ⚡ ' + (torrent.downloadSpeed / 1024 / 1024).toFixed(2) + ' MB/s';
                
                // Start playing once we have some data (5% buffer)
                if (percent >= 5 && !hasStartedPlaying) {
                    playVideo();
                }
                
                statusElement.textContent = '📥 Downloading: ' + percent + '% - ' + torrent.numPeers + ' peers';
            });

            torrent.on('done', () => {
                statusElement.textContent = '✅ Complete! Streaming from ' + torrent.numPeers + ' peers';
                progressFill.style.background = '#00FF00';
            });

            function playVideo() {
                const file = torrent.files.find(f => 
                    f.name.includes('.mp4') || f.name.includes('.mov') || f.name.includes('.webm')
                );
                
                if (file) {
                    console.log('Playing video file:', file.name);
                    file.renderTo(videoElement, (err, elem) => {
                        if (!err) {
                            videoElement.style.display = 'block';
                            hasStartedPlaying = true;
                            statusElement.textContent = '🎬 Now playing - ' + torrent.numPeers + ' peers';
                            videoElement.play().catch(e => {
                                console.log('Autoplay blocked, waiting for user interaction');
                            });
                        }
                    });
                }
            }

            // Fallback if no progress in 10 seconds
            setTimeout(() => {
                if (torrent.progress === 0) {
                    statusElement.textContent = '❌ No progress - you might be the first seeder!';
                    ${
                      cid
                        ? `
                    // Optional: Auto-fallback to IPFS
                    console.log('Falling back to IPFS');
                    videoElement.src = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
                    videoElement.style.display = 'block';
                    statusElement.textContent = '📡 Using IPFS fallback';
                    `
                        : ""
                    }
                }
            }, 10000);

            `
                : `
            // NO MAGNET LINK - Use IPFS directly
            ${
              cid
                ? `
            console.log('Using direct IPFS');
            videoElement.src = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
            videoElement.style.display = 'block';
            statusElement.textContent = '📡 Streaming from IPFS';
            progressFill.style.width = '100%';
            progressFill.style.background = '#00AAFF';
            statsElement.textContent = 'Direct IPFS streaming';
            `
                : `
            statusElement.textContent = '❌ No video source available';
            `
            }
            `
            }
        </script>
    </body>
    </html>
  `);
});

// Test neighborhood endpoint
app.get("/api/test-neighborhood", authenticateToken, async (req, res) => {
  try {
    const Neighborhood = ModelSchema.Neighborhood;
    const testNeighborhood = new Neighborhood({
      name: "Test Neighborhood",
      description: "Just testing the model",
      type: "private",
      owner: req.user._id,
      members: [
        {
          user: req.user._id,
          role: "owner",
        },
      ],
    });

    await testNeighborhood.save();

    res.json({
      success: true,
      message: "Neighborhood model works!",
      neighborhoodId: testNeighborhood._id,
    });
  } catch (error) {
    console.error("Neighborhood test error:", error);
    res.status(500).json({ error: "Model test failed" });
  }
});

// Gallery endpoint
app.get(
  "/api/neighborhoods/:id/gallery",
  authenticateToken,
  async (req, res) => {
    try {
      // 1. Set aggressive HTTP caching headers (1 hour)
      res.set("Cache-Control", "public, max-age=3600");

      const neighborhoodId = req.params.id;

      // 2. Fetch only essential metadata from your DB
      // This query is fast and reduces load vs. fetching everything
      const galleryData = await ModelSchema.Neighborhood.findOne(
        { _id: neighborhoodId },
        { videos: 1, images: 1, totalCount: 1, name: 1 }
      ).lean(); // `.lean()` for faster JSON

      if (!galleryData) {
        return res.status(404).json({ error: "Neighborhood not found" });
      }

      // 3. Return a slim, cache-friendly payload
      res.json({
        neighborhoodName: galleryData.name,
        totalCount: galleryData.totalCount || 0,
        // Send just enough data for the frontend to build the list and pass to WebTorrentMedia
        media: [
          ...(galleryData.videos || []).map((v) => ({
            id: v._id || v.id,
            title: v.title,
            fileName: v.fileName,
            fileType: "video",
            cid: v.cid,
            magnetLink: v.magnetLink, // Crucial for P2P
          })),
          ...(galleryData.images || []).map((i) => ({
            id: i._id || i.id,
            title: i.title,
            fileName: i.fileName,
            fileType: "image",
            cid: i.cid,
            magnetLink: i.magnetLink, // Crucial for P2P
          })),
        ],
      });
    } catch (error) {
      console.error("Gallery API error:", error);
      res.status(500).json({ error: "Failed to fetch gallery data" });
    }
  }
);

// Get messages for a specific room
app.get("/api/messages/:room", authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({ room: req.params.room })
      .populate("sender", "username profilePhoto")
      .sort("-createdAt")
      .limit(50);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Click tracking
app.post("/api/track-click", async (req, res) => {
  try {
    const { affiliateLinkId } = req.body;
    const user = await User.findOneAndUpdate(
      { "affiliateLinks._id": affiliateLinkId },
      { $inc: { "affiliateLinks.$.clicks": 1 } },
      { new: true }
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Click tracking error:", error);
    res.status(500).json({ error: "Tracking failed" });
  }
});

// ========== GRAPHQL SETUP (FROM CURRENT VERSION) ==========

// Correctly merge resolvers
const resolvers = {
  ...mutationResolvers, // Contains Query, Mutation, and other type resolvers
  Subscription: subscriptionResolvers.Subscription,
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

// WebSocket server for GraphQL subscriptions
const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
});

// In index.js, replace the useServer setup:

const serverCleanup = useServer(
  {
    schema,
    context: async (ctx) => {
      // For debugging, log what we get
      console.log('🔌 [WS-CONTEXT] WebSocket connection established');
      console.log('🔌 [WS-CONTEXT] Connection params:', ctx.connectionParams);
      
      // Return the pubsub instance
      return { pubsub };
    },
    // Add onSubscribe for debugging
    onSubscribe: (ctx, msg) => {
      console.log('🔌 [WS-ONSUBSCRIBE] Client subscribing:', msg.payload?.operationName);
      console.log('🔌 [WS-ONSUBSCRIBE] Variables:', msg.payload?.variables);
    },
    onConnect: (ctx) => {
      console.log('🔌 [WS-ONCONNECT] Client connected');
      return true; // Allow the connection
    },
    onDisconnect: (ctx, code, reason) => {
      console.log(`🔌 [WS-ONDISCONNECT] Client disconnected: ${code} - ${reason}`);
    },
  },
  wsServer
);

// Apollo Server v4 setup
const apolloServer = new ApolloServer({
  schema,
  introspection: true,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});

await apolloServer.start();

app.use(
  "/graphql",
  expressMiddleware(apolloServer, {
    context: async ({ req }) => {
      const { cache } = apolloServer;
      const authHeader = req?.headers?.authorization || "";
      let user = null;
      if (authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          user = { userId: decoded.userId };
        } catch (error) {
          // console.log("Token invalid:", error.message);
        }
      }
      const models = {
        User,
        Neighborhood,
        Video,
        Image,
        Message,
        ...ModelSchema // This ensures anything in your index.js is also included
      };
      return {
        user,
        pubsub,
        models,
        token: authHeader.substring(7),
        dataSources: {
          mediaAPI: new MediaAPI({ cache }),
        },
      };
    },
  })
);

// ========== SOCKET.IO SETUP (DUAL CONFIGURATION FROM CURRENT VERSION) ==========

// CHAT Socket.IO server (with separate path)
const chatIo = new Server(httpServer, {
  path: "/socket.io-chat/", // ✅ MUST match the client's 'path' option for chat
  cors: {
    origin: corsOptions.origin,
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Add chat Socket.IO authentication and event handlers FROM OLDEST VERSION
chatIo.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) return next(new Error("User not found"));

    socket.user = {
      id: user._id,
      username: user.username,
    };
    next();
  } catch (error) {
    next(new Error("Authentication error"));
  }
});

chatIo.on("connection", (socket) => {
  console.log(`User connected for chat: ${socket.user.username}`);

  socket.on("join-neighborhood", (neighborhoodId) => {
    const room = `neighborhood-${neighborhoodId}`;
    socket.join(room);
    console.log(
      `${socket.user.username} joined neighborhood chat room: ${room}`
    );
  });

  socket.on("leave-neighborhood", (neighborhoodId) => {
    const room = `neighborhood-${neighborhoodId}`;
    socket.leave(room);
    console.log(`${socket.user.username} left neighborhood chat room: ${room}`);
  });

  socket.on("join-room", (room) => {
    socket.join(room);
    console.log(`${socket.user.username} joined chat room: ${room}`);
  });

  socket.on("leave-room", (room) => {
    socket.leave(room);
    console.log(`${socket.user.username} left chat room: ${room}`);
  });

  socket.on("sendVideo", (videoId, room) => {
    console.log(`Video sent via chat: ${videoId} to room: ${room}`);
    chatIo.to(room).emit("receiveVideo", { videoId });
  });

  socket.on("message", async (data) => {
    try {
      const message = new Message({
        sender: socket.user.id,
        content: data.content,
        imageUrl: data.imageUrl,
        room: data.room,
      });
      await message.save();

      const populatedMessage = await Message.findById(message._id).populate(
        "sender",
        "username"
      );
      chatIo.to(data.room).emit("message", populatedMessage);
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected from chat: ${socket.user.username}`);
  });
});

// ========== ADD VIDEO UPLOAD HANDLER ==========
videoUploadHandler(app);

// ========== AUTH ROUTES ==========
import authRoutes from "./routes/auth.js";
app.use("/api", authRoutes);

// ========== START SERVER ==========
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`🚀 GraphQL Server ready at http://localhost:${PORT}/graphql`);
  console.log(`🚀 Subscriptions ready at ws://localhost:${PORT}/graphql`);
  console.log(`💬 Chat Socket.IO ready at path: /socket.io-chat/`);
});
