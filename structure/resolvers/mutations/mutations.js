import User from "../../models/Minnow.js";
import Chat from "../../models/Chat.js";
import Post from "../../models/Post.js";
import Group from "../../models/Group.js";
import Video from "../../models/Video.js";
import Stream from "../../models/Stream.js";
import Ad from "../../models/Ad.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

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
      // You'll need to implement this based on your message structure
      return [];
    },
    message: async (_, { id }, context) => {
      if (!context.user) throw new Error("Authentication required");
      // You'll need to implement this based on your message structure
      return null;
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
    sendMessage: async (_, { content, room, imageUrl }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const message = new Message({
        sender: context.user.userId,
        content,
        imageUrl,
        room: room || "general",
        createdAt: new Date(),
      });

      await message.save();

      // Populate sender info
      const populatedMessage = await Message.findById(message._id).populate(
        "sender",
        "username profilePhoto"
      );

      // Emit socket event
      if (context.io) {
        context.io.to(room || "general").emit("message", populatedMessage);
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
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = new User({
        username,
        email,
        password: hashedPassword,
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

    // Affiliate mutations
    addAffiliateLink: async (_, { url, title, description }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const newLink = {
        id: new mongoose.Types.ObjectId(),
        url,
        title: title || "",
        description: description || "",
        clicks: 0,
      };

      const user = await User.findByIdAndUpdate(
        context.user.userId,
        { $push: { affiliateLinks: newLink } },
        { new: true }
      );

      return user;
    },

    updateAffiliateLink: async (
      _,
      { linkId, url, title, description },
      context
    ) => {
      if (!context.user) throw new Error("Authentication required");

      const user = await User.findById(context.user.userId);
      const link = user.affiliateLinks.id(linkId);
      if (!link) throw new Error("Affiliate link not found");

      if (url) link.url = url;
      if (title) link.title = title;
      if (description) link.description = description;

      await user.save();
      return user;
    },

    removeAffiliateLink: async (_, { linkId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const user = await User.findByIdAndUpdate(
        context.user.userId,
        { $pull: { affiliateLinks: { _id: linkId } } },
        { new: true }
      );

      return user;
    },

    // Chat and Message mutations
    sendMessage: async (_, { content, room, imageUrl }, context) => {
      if (!context.user) throw new Error("Authentication required");

      // You'll need to implement this based on your message model
      // This is a placeholder - adjust based on your actual Message model
      const message = {
        id: new mongoose.Types.ObjectId(),
        content,
        room,
        imageUrl,
        sender: context.user.userId,
        createdAt: new Date(),
      };

      // Emit socket event if needed
      if (context.io) {
        context.io.to(room).emit("message", message);
      }

      return message;
    },

    deleteMessage: async (_, { messageId }, context) => {
      if (!context.user) throw new Error("Authentication required");
      // Implement message deletion logic
      return true;
    },

    createChat: async (_, { name, participantIds }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const chat = new Chat({
        name,
        participants: [...participantIds, context.user.userId],
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await chat.save();
      return chat;
    },

    joinChat: async (_, { chatId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const chat = await Chat.findByIdAndUpdate(
        chatId,
        { $addToSet: { participants: context.user.userId } },
        { new: true }
      ).populate("participants");

      return chat;
    },

    leaveChat: async (_, { chatId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      await Chat.findByIdAndUpdate(chatId, {
        $pull: { participants: context.user.userId },
      });

      return true;
    },

    // Post mutations
    createPost: async (_, { content, feedType, groupId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const post = new Post({
        author: context.user.userId,
        content,
        feedType,
        group: groupId,
        likes: [],
        comments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await post.save();
      await User.findByIdAndUpdate(context.user.userId, {
        $push: { posts: post._id },
      });

      if (groupId) {
        await Group.findByIdAndUpdate(groupId, { $push: { posts: post._id } });
      }

      return post.populate("author").populate("group");
    },

    likePost: async (_, { postId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const post = await Post.findByIdAndUpdate(
        postId,
        { $addToSet: { likes: context.user.userId } },
        { new: true }
      )
        .populate("author")
        .populate("group");

      return post;
    },

    unlikePost: async (_, { postId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const post = await Post.findByIdAndUpdate(
        postId,
        { $pull: { likes: context.user.userId } },
        { new: true }
      )
        .populate("author")
        .populate("group");

      return post;
    },

    addComment: async (_, { postId, content }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const comment = {
        id: new mongoose.Types.ObjectId(),
        author: context.user.userId,
        content,
        timestamp: new Date(),
      };

      const post = await Post.findByIdAndUpdate(
        postId,
        { $push: { comments: comment } },
        { new: true }
      )
        .populate("author")
        .populate("group");

      return post;
    },

    // Group mutations
    createGroup: async (_, { name, description }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const group = new Group({
        name,
        description,
        members: [context.user.userId],
        posts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await group.save();
      await User.findByIdAndUpdate(context.user.userId, {
        $push: { groups: group._id },
      });

      return group.populate("members");
    },

    joinGroup: async (_, { groupId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const group = await Group.findByIdAndUpdate(
        groupId,
        { $addToSet: { members: context.user.userId } },
        { new: true }
      ).populate("members");

      await User.findByIdAndUpdate(context.user.userId, {
        $push: { groups: groupId },
      });

      return group;
    },

    leaveGroup: async (_, { groupId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const group = await Group.findByIdAndUpdate(
        groupId,
        { $pull: { members: context.user.userId } },
        { new: true }
      ).populate("members");

      await User.findByIdAndUpdate(context.user.userId, {
        $pull: { groups: groupId },
      });

      return group;
    },

    // Video mutations
    addVideo: async (
      _,
      { title, description, youtubeVideoId, thumbnail },
      context
    ) => {
      if (!context.user) throw new Error("Authentication required");

      const video = new Video({
        title,
        description,
        youtubeVideoId,
        thumbnail,
        user: context.user.userId,
        createdAt: new Date(),
      });

      await video.save();
      await User.findByIdAndUpdate(context.user.userId, {
        $push: { videos: video._id },
      });

      return video.populate("user");
    },

    // Stream mutations
    addStream: async (
      _,
      { title, description, youtubeStreamId, isLive },
      context
    ) => {
      if (!context.user) throw new Error("Authentication required");

      const stream = new Stream({
        title,
        description,
        youtubeStreamId,
        isLive,
        user: context.user.userId,
        createdAt: new Date(),
      });

      await stream.save();
      await User.findByIdAndUpdate(context.user.userId, {
        $push: { streams: stream._id },
      });

      return stream.populate("user");
    },

    // Ad mutations
    addAd: async (_, { affiliateLink }, context) => {
      if (!context.user) throw new Error("Authentication required");

      // Simple URL validation
      const isValidLink = affiliateLink.startsWith("http");
      if (!isValidLink) throw new Error("Invalid affiliate link");

      const ad = new Ad({
        affiliateLink,
        user: context.user.userId,
        clicks: 0,
        createdAt: new Date(),
      });

      await ad.save();
      return ad.populate("user");
    },

    incrementAdClicks: async (_, { adId }) => {
      const ad = await Ad.findByIdAndUpdate(
        adId,
        { $inc: { clicks: 1 } },
        { new: true }
      ).populate("user");

      return ad;
    },
  },

  // Field resolvers for custom field names
  User: {
    id: (parent) => parent._id.toString(),
  },
  Chat: {
    id: (parent) => parent._id.toString(),
  },
  Message: {
    id: (parent) => parent._id?.toString() || parent.id,
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
