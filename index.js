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
import Image from "./structure/models/Image.js"; // ← ADD THIS
import Neighborhood from "./structure/models/Neighborhood.js"; // ← ADD THIS
import MediaAPI from "./datasources/MediaAPI.cjs";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// FIXED CORS - Remove your backend URL from origins
const corsOptions = {
  origin: process.env.NODE_ENV === "production"
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
// REMOVE THIS: app.use("/graphql", cors(corsOptions)); // ← Apollo handles its own CORS

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY;

connectDB();

// Import models
import Minnow from "./structure/models/User.js";
const User = Minnow;
const Message = ModelSchema.Message;

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
      .select('members')
      .lean();
    
    if (!neighborhood) return false;
    
    return neighborhood.members.some(
      member => member.user.toString() === user.userId
    );
  }
  
  return false;
}

// 1. PUBLIC endpoint - NO AUTH, aggressively cached
app.get("/api/media/public/:cid", async (req, res) => {
  const oneWeek = 604800;
  const thirtyDays = 2592000;
  
  try {
    let media = await Video.findOne({ cid: req.params.cid }).lean();
    let mediaType = 'video';
    
    if (!media) {
      media = await Image.findOne({ cid: req.params.cid }).lean();
      mediaType = 'image';
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
      "Expires": getExpiresDate(thirtyDays),
      "Vary": "Accept-Encoding",
    });
    
    return res.json({
      fileName: media.fileName,
      fileType: media.fileType,
      cid: media.cid,
      magnetLink: media.magnetLink,
      isPublic: true,
      mediaType: mediaType
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
    let mediaType = 'video';
    
    if (!media) {
      media = await Image.findOne({ cid: req.params.cid }).lean();
      mediaType = 'image';
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
      "Vary": "Accept-Encoding, Authorization",
      "Expires": getExpiresDate(604800),
    });
    
    return res.json({
      fileName: media.fileName,
      fileType: media.fileType,
      cid: media.cid,
      magnetLink: media.magnetLink,
      isPublic: media.isPublic,
      mediaType: mediaType
    });
    
  } catch (error) {
    console.error("Private media API error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 3. SMART endpoint - Auto-detects public/private (REPLACES the old one)
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
    let mediaType = 'video';
    
    if (!media) {
      media = await Image.findOne({ cid: req.params.cid }).lean();
      mediaType = 'image';
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
        "Vary": "Accept-Encoding",
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
        "Vary": "Accept-Encoding, Authorization",
      });
    }
    
    return res.json({
      fileName: media.fileName,
      fileType: media.fileType,
      cid: media.cid,
      magnetLink: media.magnetLink,
      isPublic: media.isPublic,
      mediaType: mediaType
    });
    
  } catch (error) {
    console.error("Media API error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

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
      token: authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null,
    };
  },
  dataSources: () => ({
    mediaAPI: new MediaAPI(),
  }),
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

// Add this near your other API routes in server.js
app.get("/api/neighborhoods/:id/gallery", authenticateToken, async (req, res) => {
  try {
    // 1. Set aggressive HTTP caching headers (1 hour)
    res.set('Cache-Control', 'public, max-age=3600');

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
        ...(galleryData.videos || []).map(v => ({
          id: v._id || v.id,
          title: v.title,
          fileName: v.fileName,
          fileType: 'video',
          cid: v.cid,
          magnetLink: v.magnetLink, // Crucial for P2P
        })),
        ...(galleryData.images || []).map(i => ({
          id: i._id || i.id,
          title: i.title,
          fileName: i.fileName,
          fileType: 'image',
          cid: i.cid,
          magnetLink: i.magnetLink, // Crucial for P2P
        }))
      ]
    });

  } catch (error) {
    console.error("Gallery API error:", error);
    res.status(500).json({ error: "Failed to fetch gallery data" });
  }
});


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
