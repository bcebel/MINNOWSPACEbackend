const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const http = require("http");
const cors = require("cors");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "./.env") });

const app = express();
app.use(express.json());

app.use(cors());

const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: { origin: "https://minnowspacexpo.vercel.app" },
});

const URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

connectDB();

// Schema definitions
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", UserSchema);

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  content: String,
  imageUrl: String,
  room: String,
  createdAt: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", MessageSchema);

// Middleware

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
};

// Routes and Socket.IO handlers unchanged from your code
