import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import jwt from "jsonwebtoken";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { ApolloServer } from "apollo-server-express";
import { PubSub } from "graphql-subscriptions";
import { ApolloServerPluginDrainHttpServer } from "apollo-server-core";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/use/ws";

import typeDefs from "./structure/typedefs/typedefs.js";
import ModelSchema from "./structure/models/index.js";
import mutationResolvers from "./structure/resolvers/mutations/mutations.js";
import subscriptionResolvers from "./structure/resolvers/subscriptions/subscriptions.js";
import connectDB from "./config/connection.js";
import videoUploadHandler from "./videoUploadHandler.js";
import Video from "./structure/models/Video.js";
import Image from "./structure/models/Image.js";
import Neighborhood from "./structure/models/Neighborhood.js";
import MediaAPI from "./datasources/MediaAPI.cjs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const pubsub = new PubSub(); // Instantiate PubSub

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

// API routes...
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
    
    if (media.isPublic) {
      res.set({
        "Cache-Control": `public, max-age=604800, immutable`,
        "CDN-Cache-Control": `public, max-age=2592000`,
        "Vary": "Accept-Encoding",
      });
    } else {
      const hasAccess = await checkPrivateMediaAccess(media, user);
      
      if (!hasAccess) {
        res.set({ "Cache-Control": "no-cache" });
        return res.status(403).json({ error: "Access denied" });
      }
      
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

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => file.mimetype.startsWith("image/") ? cb(null, true) : cb(new Error("Only image files are allowed!"), false) });
app.post("/api/upload-image", authenticateToken, upload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file provided" });
        res.json({ success: true, fileUrl: "https://picsum.photos/200/300", message: "File received successfully - ready for IPFS integration", debug: { fileName: req.file.originalname, fileSize: req.file.size, hasBuffer: !!req.file.buffer } });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Failed to upload file", details: error.message });
    }
});

app.get("/api/webtorrent-player", (req, res) => {
  const { fileName, magnetLink, cid, id } = req.query;
  let cleanMagnetLink = decodeURIComponent(magnetLink || "");
  if (cleanMagnetLink.startsWith("magnet:?magnet:")) {
    cleanMagnetLink = cleanMagnetLink.replace("magnet:?magnet:", "magnet:?");
  }
  res.send(`...`); // WebTorrent player HTML
});

app.get("/api/test-neighborhood", authenticateToken, async (req, res) => {
  // ... test route
});

// START: WebSocket and Apollo Server Setup
const httpServer = http.createServer(app);

const resolvers = {
  ...mutationResolvers,
  Subscription: subscriptionResolvers.Subscription,
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
});

const serverCleanup = useServer({ schema }, wsServer);

const apolloServer = new ApolloServer({
  schema,
  cache: "bounded",
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
  context: ({ req }) => {
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
    return { user, pubsub, token: authHeader.substring(7) };
  },
  dataSources: () => ({
    mediaAPI: new MediaAPI(),
  }),
});

await apolloServer.start();
apolloServer.applyMiddleware({
  app,
  path: "/graphql",
  cors: false, // Use top-level CORS
});

// END: WebSocket and Apollo Server Setup

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Socket.IO Server (for other real-time features)
const io = new Server(httpServer, {
  cors: corsOptions,
});

import authRoutes from "./routes/auth.js";
app.use("/api", authRoutes);

app.get("/api/neighborhoods/:id/gallery", authenticateToken, async (req, res) => {
  // ... gallery route
});

app.get("/api/messages/:room", authenticateToken, async (req, res) => {
  // ... messages route
});

io.use(async (socket, next) => {
  // ... io auth middleware
});

io.on("connection", (socket) => {
  // ... io connection logic
});

app.post("/api/track-click", async (req, res) => {
  // ... click tracking
});

videoUploadHandler(app);

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`GraphQL Server running at http://localhost:${PORT}${apolloServer.graphqlPath}`);
});
