import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import jwt from "jsonwebtoken";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { ApolloServer, gql } from "apollo-server-express";
import typeDefs from "./structure/typedefs/typedefs.js";
import ModelSchema from "./structure/models/index.js";
import resolvers from "./structure/resolvers/queries/queries.js";
import connectDB from "./config/connection.js";
import videoUploadHandler from "./videoUploadHandler.js";
import Video from "./structure/models/Video.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? [

          "https://bubblebase.app",
          "https://gigunit.com",
          "https://gigunit.vercel.app",
          "https://studio.apollographql.com",
          "https://studio.apollographql.dev",
          "http://localhost:3001",
          "http://localhost:8081",
          "http://127.0.0.1:5501",
          "http://localhost:19006",
          "exp://localhost:19000",
        ]
      : [
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

app.use(cors(corsOptions));
app.use("/graphql", cors(corsOptions));

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY;

connectDB();

// Import models
import Minnow from "./structure/models/User.js";
const User = Minnow;
const Message = ModelSchema.Message;

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

// ⭐⭐⭐ USE MEMORY STORAGE - FIXED ⭐⭐⭐
const storage = multer.memoryStorage(); // This creates req.file.buffer

const upload = multer({
  storage: storage, // Now using memory storage
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
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
              hasBuffer: !!req.file.buffer, // This should be true now
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

// Backend route - /api/webtorrent-player
// Backend route - UPDATED FOR EARLIER PLAYBACK
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

// Add this after your other routes, before socket.io
app.get("/api/test-neighborhood", authenticateToken, async (req, res) => {
  try {
    // Just test if the model works
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
// Remove the static file serving since we're using memory storage
// app.use("/uploads", express.static("uploads"));

// Apollo Server setup
const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  cache: "bounded",
  introspection: true,
  playground: {
    version: "1.7.33", // Force classic version
    settings: {
      "request.credentials": "include",
    },
    tabs: [
      {
        endpoint: "http://localhost:3001/graphql",
        query: `# Welcome to GraphQL Playground`,
      },
    ],
  },
  context: ({ req }) => {
    console.log("🔐 GraphQL Context - Headers:", req.headers);

    const authHeader = req.headers.authorization;
    let user = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        user = { userId: decoded.userId }; // ✅ CORRECT
        console.log("🔐 GraphQL Context - Decoded user:", decoded);
      } catch (error) {
        console.log("🔐 GraphQL Context - Token invalid:", error.message);
      }
    }

    return {
      user,
      io,
    };
  },
});

await apolloServer.start();
apolloServer.applyMiddleware({
  app,
  path: "/graphql",
  cors: corsOptions,
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Socket.IO Server
const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

// Auth routes
import authRoutes from "./routes/auth.js";
app.use("/api", authRoutes);

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

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId); // ✅ CORRECT - using userId

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

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.user.username}`);

  socket.on("join-neighborhood", (neighborhoodId) => {
    const room = `neighborhood-${neighborhoodId}`;
    socket.join(room);
    console.log(`${socket.user.username} joined neighborhood room: ${room}`);
  });

  socket.on("leave-neighborhood", (neighborhoodId) => {
    const room = `neighborhood-${neighborhoodId}`;
    socket.leave(room);
    console.log(`${socket.user.username} left neighborhood room: ${room}`);
  });

  socket.on("join-room", (room) => {
    socket.join(room);
    console.log(`${socket.user.username} joined room: ${room}`);
  });

  socket.on("leave-room", (room) => {
    socket.leave(room);
    console.log(`${socket.user.username} left room: ${room}`);
  });

  socket.on("sendVideo", (videoId, room) => {
    console.log(`Video sent: ${videoId} to room: ${room}`);
    io.to(room).emit("receiveVideo", { videoId });
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
      io.to(data.room).emit("message", populatedMessage);
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.user.username}`);
  });
});

// Replace this endpoint in your server.j
/*
app.get("/api/videos", async (req, res) => {
  try {
    const videos = await Video.find({})
      .select(
        "title description fileName fileSize fileType cid ipfsUrl magnetLink user createdAt"
      ) // ADD magnetLink here
      .sort({ createdAt: -1 })
      .populate("user", "username");

    console.log("Videos fetched:", videos.length);
    if (videos.length > 0) {
      console.log("Sample video:", {
        title: videos[0].title,
        magnetLink: videos[0].magnetLink, // This should now show the magnet link
        fileName: videos[0].fileName,
      });
    }

    res.json(videos);
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to fetch videos.");
  }
});

// Add this endpoint to your server.js
app.get("/api/videos/:id", async (req, res) => {
  try {
    const video = await Video.findById(req.params.id)
      .select(
        "title description fileName fileSize fileType cid ipfsUrl magnetLink user createdAt"
      )
      .populate("user", "username");

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    console.log("Single video fetched:", {
      title: video.title,
      magnetLink: video.magnetLink,
      fileName: video.fileName,
    });

    res.json(video);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch video." });
  }
});

// Add this debug endpoint to check your data
app.get("/api/debug-videos", async (req, res) => {
  try {
    const videos = await Video.find({});

    const debugData = videos.map((video) => ({
      _id: video._id,
      title: video.title,
      fileName: video.fileName,
      magnetLink: video.magnetLink, // This will show if it exists in DB
      cid: video.cid,
      hasMagnetLink: !!video.magnetLink,
      magnetLinkLength: video.magnetLink ? video.magnetLink.length : 0,
    }));

    console.log("DEBUG - All videos with magnet links:", debugData);
    res.json(debugData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Debug failed" });
  }
});

*/




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

videoUploadHandler(app);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `GraphQL Server running at http://localhost:${PORT}${apolloServer.graphqlPath}`
  );
  console.log(
    "https://studio.apollographql.com/sandbox/explorer?_gl=1%2A1xbtmmh%2A_gcl_au%2AMjA3ODU5MDkyMi4xNzYyMjI1ODY0"
  );
  console.log(
    `🚀 Apollo Studio Sandbox: https://studio.apollographql.com/sandbox/explorer/?endpoint=${encodeURIComponent(
      `http://localhost:${PORT}${apolloServer.graphqlPath}`
    )}`
  );

  console.log(
    "https://studio.apollographql.com/graph/gigunit/variant/current/explorer"
  );
});
