import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import jwt from "jsonwebtoken";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
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
import subscriptionResolvers from "./structure/resolvers/subscriptions/subscriptions.js";
import connectDB from "./config/connection.js";
import videoUploadHandler from "./videoUploadHandler.js";
import Video from "./structure/models/Video.js";
import Image from "./structure/models/Image.js";
import Neighborhood from "./structure/models/Neighborhood.js";
import MediaAPI from "./datasources/MediaAPI.cjs";
import { PubSub } from "graphql-subscriptions";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);

const pubsub = new PubSub();

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
app.use(express.json());

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY;

connectDB();

// Import models
import Minnow from "./structure/models/User.js";
const User = Minnow;
const Message = ModelSchema.Message;

// ... (Keep all your existing middleware and REST API routes) ...

// Correctly merge resolvers
const resolvers = {
  ...mutationResolvers, // Contains Query, Mutation, and other type resolvers
  Subscription: subscriptionResolvers.Subscription,
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

// WebSocket server for subscriptions
const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
});

const serverCleanup = useServer({ schema }, wsServer);

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
      return {
        user,
        pubsub,
        token: authHeader.substring(7),
        dataSources: {
          mediaAPI: new MediaAPI({ cache }),
        },
      };
    },
  })
);

// ✅ Correct Socket.IO CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: corsOptions.origin,  // This is your array of allowed origins
    credentials: corsOptions.credentials,
    allowedHeaders: corsOptions.allowedHeaders,
    methods: corsOptions.methods
  },
  pingInterval: 20000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling'],
});


// ... (The rest of your file remains here) ...
// Auth routes
import authRoutes from "./routes/auth.js";
app.use("/api", authRoutes);

// ... other routes ...

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`🚀 GraphQL Server ready at http://localhost:${PORT}/graphql`);
  console.log(`🚀 Subscriptions ready at ws://localhost:${PORT}/graphql`);
});