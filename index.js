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
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { create } from "ipfs-http-client";

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
          "http://localhost:8081",
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

const s3 = new S3Client({
  endpoint: "https://s3.filebase.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.FILEBASE_ACCESS_KEY,
    secretAccessKey: process.env.FILEBASE_SECRET_KEY,
  },
});
// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

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

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}



// Updated upload endpoint with IPFS/Filebase
app.post(
  "/api/upload-image",
  authenticateToken,
  upload.single("file"), // Changed from "image" to "file" to handle both
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      console.log("Uploading file to IPFS via Filebase...", {
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });

      // Calculate CID (optional but good for verification)
      const ipfs = create();
      const cid = await ipfs.add(req.file.buffer, { onlyHash: true });
      const calculatedCid = cid.cid.toString();

      // Upload to Filebase IPFS
      const params = {
        Bucket: process.env.FILEBASE_BUCKET_NAME,
        Key: `${Date.now()}-${req.file.originalname}`, // Or use calculatedCid as key
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        Metadata: {
          originalname: req.file.originalname,
          cid: calculatedCid,
        },
      };

      const command = new PutObjectCommand(params);
      await s3.send(command);

      // Generate public IPFS URL
      const ipfsUrl = `https://ipfs.filebase.io/ipfs/${calculatedCid}`;

      console.log("File uploaded to IPFS:", ipfsUrl);

      res.json({
        success: true,
        fileUrl: ipfsUrl,
        cid: calculatedCid,
        message: "File uploaded to IPFS successfully",
        fileType: req.file.mimetype.startsWith("image/") ? "image" : "video",
      });
    } catch (error) {
      console.error("IPFS upload error:", error);
      res.status(500).json({
        error: "Failed to upload file to IPFS",
        details: error.message,
      });
    }
  }
);

// Serve uploaded files statically
app.use("/uploads", express.static("uploads"));

// Apollo Server setup
const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  cache: "bounded",
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
});
