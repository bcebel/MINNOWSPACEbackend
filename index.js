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
import typeDefs  from "./schemas/typeDefs.js";
import  resolvers  from "./schemas/resolvers.js";
import db from "./config/connection.js";


import { graphql } from "graphql";

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

// Step 3: Set up Apollo Server
const apolloServer = new ApolloServer({ typeDefs, resolvers, cors: corsOptions,  });
await apolloServer.start();
apolloServer.applyMiddleware({ app });

// Step 4: Set up Socket.IO Server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: corsOptions.methods,
    credentials: corsOptions.credentials,
  },
});

const URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET;

mongoose
  .connect(URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((error) => console.error("MongoDB connection error:", error));

// Step 5: Set up User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", UserSchema);

// Message Schema and Model
const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  content: String,
  imageUrl: String,
  room: String,
  createdAt: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", MessageSchema);

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

// Step 6: API Routes
app.post("/api/register", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = new User({
      username: req.body.username,
      password: hashedPassword,
    });
    await user.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.body.username });
    if (!user) return res.status(400).json({ error: "User not found" });

    const validPassword = await bcrypt.compare(
      req.body.password,
      user.password
    );
    if (!validPassword)
      return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET
    );
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/test", (req, res) => {
  res.send("Hello World");
});

// Get messages for a specific room
app.get("/api/messages/:room", authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({ room: req.params.room })
      .populate("sender", "username")
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

// Step 8: Start the Server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `GraphQL Server running at http://localhost:${PORT}${apolloServer.graphqlPath}`
  );
});
