import User from "../../models/User.js";
import Chat from "../../models/Chat.js";
import Post from "../../models/Post.js";
import Group from "../../models/Group.js";
import Video from "../../models/Video.js";
import Stream from "../../models/Stream.js";
import Ad from "../../models/Ad.js";
import Message from "../../models/Message.js"; // ✅ ADD THIS IMPORT
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose"; // ✅ ADD THIS IMPORT

const resolvers = {
  Query: {
    // User queries
    users: async () => await User.find(),
    user: async (_, { id }) => await User.findById(id),
    me: async (_, __, context) => {
      if (!context.user) throw new Error("Authentication required");
      return await User.findById(context.user.userId);
    },

    // Video queries
    videos: async () => await Video.find().populate("user"),
    video: async (_, { id }) => await Video.findById(id).populate("user"),

    // Stream queries
    streams: async () => await Stream.find().populate("user"),
    stream: async (_, { id }) => await Stream.findById(id).populate("user"),

    // Ad queries
    ads: async () => await Ad.find().populate("user"),
    ad: async (_, { id }) => await Ad.findById(id).populate("user"),

    // Chat queries
    chats: async () => await Chat.find().populate("participants"),
    chat: async (_, { id }) => await Chat.findById(id).populate("participants"),

    // ✅ FIXED: Message queries - REMOVE the placeholder implementation
    messages: async (_, { room }, context) => {
      if (!context.user) throw new Error("Authentication required");

      console.log("🔍 Backend: Fetching messages for room:", room);

      const query = room ? { room } : {};
      const messages = await Message.find(query)
        .populate("sender", "username profilePhoto")
        .sort({ createdAt: -1 })
        .limit(50);

      console.log("✅ Backend: Found", messages.length, "messages");
      return messages;
    },

    message: async (_, { id }, context) => {
      if (!context.user) throw new Error("Authentication required");
      return await Message.findById(id).populate(
        "sender",
        "username profilePhoto"
      );
    },

    // Post queries
    posts: async (_, { feedType, groupId }) => {
      let query = {};
      if (feedType) query.feedType = feedType;
      if (groupId) query.group = groupId;
      return await Post.find(query).populate("author").populate("group");
    },
    post: async (_, { id }) =>
      await Post.findById(id).populate("author").populate("group"),

    // Group queries
    groups: async () => await Group.find().populate("members"),
    group: async (_, { id }) => await Group.findById(id).populate("members"),
  },

  Mutation: {
    // ✅ FIXED: Only ONE sendMessage mutation (remove the duplicate)
    sendMessage: async (_, { content, room, imageUrl }, context) => {
      if (!context.user) throw new Error("Authentication required");

      console.log("🔍 Backend: Sending message:", { content, room });

      const message = new Message({
        sender: context.user.userId,
        content,
        imageUrl: imageUrl || null,
        room: room || "general",
        createdAt: new Date(),
      });

      await message.save();
      console.log("✅ Backend: Message saved with ID:", message._id);

      // Populate sender info
      const populatedMessage = await Message.findById(message._id).populate(
        "sender",
        "username profilePhoto"
      );

      console.log("✅ Backend: Message populated");

      // Emit socket event
      if (context.io) {
        context.io.to(room || "general").emit("message", populatedMessage);
        console.log("✅ Backend: Socket event emitted");
      }

      return populatedMessage;
    },

    // Auth mutations
    registerUser: async (_, { username, email, password }) => {
      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }],
      });
      if (existingUser) throw new Error("User already exists");

      // Hash password
      // const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = new User({
        username,
        email,
        password: password,
        profilePhoto: `https://ui-avatars.com/api/?name=${encodeURIComponent(
          username
        )}&background=00FF00&color=000`,
        affiliateLinks: [],
        videos: [],
        streams: [],
        chats: [],
        posts: [],
        groups: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET || "SECRET_KEY",
        { expiresIn: "24h" }
      );

      // Return AuthPayload structure
      return {
        token,
        user,
      };
    },

    loginUser: async (_, { username, password }) => {
      const user = await User.findOne({ username });
      if (!user) throw new Error("User not found");

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) throw new Error("Invalid password");

      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET || "SECRET_KEY",
        { expiresIn: "24h" }
      );

      // Return AuthPayload structure
      return {
        token,
        user,
      };
    },

    // ... keep all your other mutations but REMOVE the duplicate sendMessage
    // Affiliate mutations, Chat mutations, Post mutations, etc.
    // (all the ones below your auth mutations)

    // REMOVE THIS DUPLICATE:
    // sendMessage: async (_, { content, room, imageUrl }, context) => {
    //   if (!context.user) throw new Error("Authentication required");
    //
    //   // You'll need to implement this based on your message model
    //   // This is a placeholder - adjust based on your actual Message model
    //   const message = {
    //     id: new mongoose.Types.ObjectId(),
    //     content,
    //     room,
    //     imageUrl,
    //     sender: context.user.userId,
    //     createdAt: new Date(),
    //   };
    //
    //   // Emit socket event if needed
    //   if (context.io) {
    //     context.io.to(room).emit("message", message);
    //   }
    //
    //   return message;
    // },

    // ... keep the rest of your mutations
  },

  // Field resolvers remain the same
  User: {
    id: (parent) => parent._id.toString(),
  },
  Chat: {
    id: (parent) => parent._id.toString(),
  },
  Message: {
    id: (parent) => parent._id.toString(),
    sender: async (parent) => {
      if (parent.sender && typeof parent.sender === "object")
        return parent.sender;
      return await User.findById(parent.sender);
    },
  },
  Post: {
    id: (parent) => parent._id.toString(),
  },
  Group: {
    id: (parent) => parent._id.toString(),
  },
  Video: {
    id: (parent) => parent._id.toString(),
  },
  Stream: {
    id: (parent) => parent._id.toString(),
  },
  Ad: {
    id: (parent) => parent._id.toString(),
  },
  AffiliateLink: {
    id: (parent) => parent._id?.toString() || parent.id,
  },
  Comment: {
    id: (parent) => parent._id?.toString() || parent.id,
    author: async (parent) => {
      if (parent.author && typeof parent.author === "object")
        return parent.author;
      return await User.findById(parent.author);
    },
  },
};

export default resolvers;
