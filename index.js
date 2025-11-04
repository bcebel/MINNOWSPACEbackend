import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import path from "path";
import { ApolloServer, gql } from "apollo-server-express";
import authMiddleware from "./utils/auth.js";
import typeDefs from "./structure/typedefs/typedefs.js";
import ModelSchema from "./structure/models/index.js";
import resolvers from "./structure/resolvers/queries/queries.js";
import connectDB from "./config/connection.js";
import videoUploadHandler from "./videoUploadHandler.js"; // Import the video upload handler
import Video from "./structure/models/Video.js";
dotenv.config();
// Step 1: Define Apollo GraphQL Schema
// Step 2: Create Express app and set up Apollo Server
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      "https://studio.apollographql.com",
      "https://minnowspace.vercel.app",
      "http://localhost:3001",
      "http://localhost:3001/graphql",
      "http://localhost:8081",
      "http://localhost:8081/",
      "http://127.0.0.1:5501",
    ];
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST"],
  credentials: true,
};
app.use(cors(corsOptions));
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});
// Step 3: Set up Apollo Server
const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
});
await apolloServer.start();
apolloServer.applyMiddleware({ app, cors: false });

// Step 4: Set up Socket.IO Server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: corsOptions.methods,
    credentials: corsOptions.credentials,
  },
});

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

connectDB();
// Step 5: Set up User Schema
import Minnow from "./structure/models/User.js";
const User = Minnow;

// Message Schema and Model
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

// Step 7: Socket.IO Event Handling
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error("Authentication error"));
    socket.user = decoded;
    next();
  });
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

  // Video message handling
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
      .sort({ createdAt: -1 }) // Sort by newest first
      .populate("user", "username"); // Include uploader's username
    res.json(videos);
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to fetch videos.");
  }
});

// Simple click tracking - add this with your other routes
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

// Add this function to fetch affiliate data separately
const fetchUserAffiliateData = async (userId) => {
  try {
    const response = await fetch(`${BACKEND_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query GetUserAffiliateLinks($userId: ID!) {
            user(id: $userId) {
              id
              username
              affiliateLinks {
                id
                url
                title
                clicks
              }
            }
          }
        `,
        variables: { userId },
      }),
    });

    const result = await response.json();
    return result.data?.user;
  } catch (error) {
    console.log("Failed to fetch affiliate data:", error);
    return null;
  }
};

// Then in your VideoCard component, you can fetch affiliate data when needed

videoUploadHandler(app);

// Step 8: Start the Server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `GraphQL Server running at http://localhost:${PORT}${apolloServer.graphqlPath}`
  );
});
