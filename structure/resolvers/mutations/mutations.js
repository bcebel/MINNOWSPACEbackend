import User from "../../models/User.js";
import Chat from "../../models/Chat.js";
import Post from "../../models/Post.js";
import Group from "../../models/Group.js";
import Video from "../../models/Video.js";
import Stream from "../../models/Stream.js";
import Ad from "../../models/Ad.js";
import Message from "../../models/Message.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

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

    // Message queries
    messages: async (_, { room }, context) => {
      if (!context.user) throw new Error("Authentication required");
      console.log("🔍 Backend: Fetching messages for room:", room);

      const query = room ? { room } : {};
      const messages = await Message.find(query)
        .populate("sender", "username profilePhoto")
        .sort({ createdAt: 1 })
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
    sendMessage: async (_, { content, room, imageUrl, videoUrl }, context) => {
      if (!context.user) throw new Error("Authentication required");

      console.log("🔍 Backend: Sending message:", {
        content,
        room,
        imageUrl,
        videoUrl,
      });

      const message = new Message({
        sender: context.user.userId,
        content,
        imageUrl: imageUrl || null,
        videoUrl: videoUrl || null, // Add this too for future use
        room: room || "general",
        createdAt: new Date(),
      });

      await message.save();
      console.log("✅ Backend: Message saved with ID:", message._id);

      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "username profilePhoto")
        .exec();

      console.log("✅ Backend: Message populated:", populatedMessage);

      if (context.io) {
        context.io.to(room || "general").emit("message", populatedMessage);
        console.log("✅ Backend: Socket event emitted");
      } else {
        console.log("❌ No IO in context - cannot emit socket event");
      }

      return populatedMessage;
    },

    registerUser: async (_, { username, email, password }) => {
      const existingUser = await User.findOne({
        $or: [{ email }, { username }],
      });
      if (existingUser) throw new Error("User already exists");

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

      const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });

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

      const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });

      return {
        token,
        user,
      };
    },

    // Add your other mutations here...
  }, // ← This closes the Mutation object

  // Field resolvers
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
}; // ← This closes the resolvers object

export default resolvers;
