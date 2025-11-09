import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { ApolloServer, gql } from "apollo-server-express";
import authMiddleware from "./utils/auth.js";
import typeDefs from "./structure/typedefs/typedefs.js";
import ModelSchema from "./structure/models/index.js";
import resolvers from "./structure/resolvers/queries/queries.js";
import connectDB from "./config/connection.js";
import videoUploadHandler from "./videoUploadHandler.js";
import Video from "./structure/models/Video.js";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? [

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
      members: [{
        user: req.user._id,
        role: "owner"
      }]
    });
    
    await testNeighborhood.save();
    
    res.json({ 
      success: true, 
      message: "Neighborhood model works!",
      neighborhoodId: testNeighborhood._id 
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
        user = { userId: decoded._id };
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
  cors: false,
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
    const user = await User.findById(decoded._id);

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

app.get("/api/videos", async (req, res) => {
  try {
    const videos = await Video.find({})
      .sort({ createdAt: -1 })
      .populate("user", "username");
    res.json(videos);
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to fetch videos.");
  }
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
  console.log(`🚀 Apollo Studio Sandbox: https://studio.apollographql.com/sandbox/explorer/?endpoint=${encodeURIComponent(`http://localhost:${PORT}${apolloServer.graphqlPath}`)}`);

  console.log(
    "https://studio.apollographql.com/graph/gigunit/variant/current/explorer"
  );
  
});


