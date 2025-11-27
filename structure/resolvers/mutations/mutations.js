import User from "../../models/User.js";
import Chat from "../../models/Chat.js";
import Post from "../../models/Post.js";
import Group from "../../models/Group.js";
import Video from "../../models/Video.js";
import Stream from "../../models/Stream.js";
import Ad from "../../models/Ad.js";
import Neighborhood from "../../models/Neighborhood.js";
import Message from "../../models/Message.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
// Define this at the TOP of your resolvers file (with your other imports)
const validateAffiliateLink = (link) => {
  const regex = /^(https?:\/\/)(www\.)?(impact\.com|cj\.com|rakuten\.com)\/.*$/;
  return regex.test(link);
};


const resolvers = {
  Query: {
    // User queries
    users: async () => await User.find(),
    user: async (_, { id }) => await User.findById(id),
    me: async (_, __, context) => {
      if (!context.user) throw new Error("Authentication required");
      return await User.findById(context.user.userId);
    },
    userByUsername: async (_, { username }) => {
      const user = await User.findOne({ username });
      if (!user) throw new Error("User not found");
      return user;
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

    neighborhoods: async () => {
      return await Neighborhood.find({ isActive: true })
        .populate("owner", "username profilePhoto")
        .populate("members.user", "username profilePhoto")
        .sort({ createdAt: -1 });
    },

    // Get specific neighborhood
    neighborhood: async (_, { id }) => {
      return await Neighborhood.findById(id)
        .populate("owner", "username profilePhoto")
        .populate("members.user", "username profilePhoto")
        .populate("joinRequests.user", "username profilePhoto");
    },

    // Get neighborhoods the current user belongs to
    myNeighborhoods: async (_, __, context) => {
      if (!context.user) throw new Error("Authentication required");

      return await Neighborhood.find({
        "members.user": context.user.userId,
        isActive: true,
      })
        .populate("owner", "username profilePhoto")
        .populate("members.user", "username profilePhoto")
        .sort({ createdAt: -1 });
    },

    // Discover public neighborhoods
    discoverNeighborhoods: async () => {
      return await Neighborhood.find({
        type: "public",
        isActive: true,
      })
        .populate("owner", "username profilePhoto")
        .populate("members.user", "username profilePhoto")
        .sort({ createdAt: -1 })
        .limit(20); // Limit for discovery feed
    },
    neighborhoodMessages: async (_, { neighborhoodId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      // Check if user is member of this neighborhood
      const neighborhood = await Neighborhood.findById(neighborhoodId);
      if (!neighborhood) throw new Error("Neighborhood not found");

      const isMember = neighborhood.members.some(
        (member) => member.user.toString() === context.user.userId
      );

      if (!isMember) throw new Error("Not a member of this neighborhood");

      // Message.find() always returns an array, so no need for || []
      return await Message.find({ neighborhood: neighborhoodId })
        .populate("sender", "username profilePhoto")
        .sort({ createdAt: -1 })
        .limit(50);
    },

    // Get videos for a specific neighborhood
    neighborhoodVideos: async (_, { neighborhoodId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      // Check membership
      const neighborhood = await Neighborhood.findById(neighborhoodId);
      const isMember = neighborhood.members.some(
        (member) => member.user.toString() === context.user.userId
      );

      if (!isMember) throw new Error("Not a member of this neighborhood");

      return await Video.find({ neighborhood: neighborhoodId })
        .populate("user", "username profilePhoto")
        .sort({ createdAt: -1 });
    },

    getMyVideos: async (_, __, { user }) => {
      try {
        if (!user) {
          throw new Error("Authentication required");
        }

        console.log("🔐 Fetching videos for user:", user.userId);

        const videos = await Video.find({ user: user.userId })
          .populate("user", "username profilePhoto")
          .populate("neighborhood", "name description")
          .sort({ createdAt: -1 });

        console.log(`✅ Found ${videos.length} videos for user ${user.userId}`);
        return videos;
      } catch (error) {
        console.error("❌ Error in getMyVideos:", error);
        throw new Error("Failed to fetch videos: " + error.message);
      }
    },
    // NEW: Get neighborhood videos (with access control)
    getNeighborhoodVideos: async (_, { neighborhoodId }, { user }) => {
      try {
        if (!user) {
          throw new Error("Authentication required");
        }

        console.log("🏘️ Fetching neighborhood videos:", {
          neighborhoodId,
          userId: user.userId,
        });

        // Verify user has access to this neighborhood
        const neighborhood = await Neighborhood.findOne({
          _id: neighborhoodId,
          $or: [{ owner: user.userId }, { "members.user": user.userId }],
        });

        if (!neighborhood) {
          throw new Error("Access denied to neighborhood");
        }

        const videos = await Video.find({ neighborhood: neighborhoodId })
          .populate("user", "username profilePhoto")
          .populate("neighborhood", "name description")
          .sort({ createdAt: -1 });

        console.log(
          `✅ Found ${videos.length} videos for neighborhood ${neighborhoodId}`
        );
        return videos;
      } catch (error) {
        console.error("❌ Error in getNeighborhoodVideos:", error);
        throw new Error(
          "Failed to fetch neighborhood videos: " + error.message
        );
      }
    },

    // NEW: Get specific user's videos (public only or with permission)
    getUserVideos: async (_, { userId }, { user }) => {
      try {
        if (!user) {
          throw new Error("Authentication required");
        }

        console.log("👤 Fetching user videos:", {
          targetUserId: userId,
          requestorId: user.userId,
        });

        // Users can see their own videos or public videos from others
        const query = { user: userId };

        // If requesting someone else's videos, only show public ones
        if (userId !== user.userId) {
          query.isPublic = true;
        }

        const videos = await Video.find(query)
          .populate("user", "username profilePhoto")
          .populate("neighborhood", "name description")
          .sort({ createdAt: -1 });

        console.log(`✅ Found ${videos.length} videos for user ${userId}`);
        return videos;
      } catch (error) {
        console.error("❌ Error in getUserVideos:", error);
        throw new Error("Failed to fetch user videos: " + error.message);
      }
    },
  },

  Mutation: {
    sendMessage: async (
      _,
      {
        content,
        room,
        imageUrl,
        videoUrl,
        fileUrl,
        fileName,
        fileType,
        fileSize,
        magnetLink,
        mimeType,
        ipfsHash,
        ipfsData,
        neighborhoodId,
        cid,
        ipfsUrl,
      },
      context
    ) => {
      if (!context.user) throw new Error("Authentication required");

      console.log("🔍 Backend: Sending message:", {
        content,
        room,
        imageUrl,
        videoUrl,
        neighborhoodId,
      });

      let neighborhood = null;
      if (neighborhoodId) {
        neighborhood = await Neighborhood.findById(neighborhoodId);
        const isMember = neighborhood.members.some(
          (member) => member.user.toString() === context.user.userId
        );
        if (!isMember) throw new Error("Not a member of this neighborhood");
      }
      //const magnetLink = ipfsData?.magnetLink || null;

      const message = new Message({
        sender: context.user.userId,
        content,
        imageUrl: imageUrl || null,
        videoUrl: videoUrl || null,
        fileUrl: fileUrl || null,
        magnetLink: magnetLink || null,
        fileName: fileName || null,
        fileType: fileType || null,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
        ipfsHash: ipfsHash || null,
        ipfsData: ipfsData || null,
        cid: cid || null,
        ipfsUrl: ipfsUrl || null,
        room: room || "general",
        neighborhood: neighborhoodId || null,
        createdAt: new Date(),
      });

      await message.save();
      console.log("✅ Backend: Message saved with ID:", message._id);

      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "username profilePhoto")
        .exec();

      const result = {
        ...populatedMessage.toObject(),
        id: populatedMessage._id.toString(), // Convert ObjectId to string
        sender: populatedMessage.sender
          ? {
              ...populatedMessage.sender.toObject(),
              id: populatedMessage.sender._id.toString(), // Convert sender ID too
            }
          : null,
      };

      console.log("✅ Backend: Message populated:", populatedMessage);

      if (context.io) {
        const emitRoom = neighborhoodId
          ? `neighborhood-${neighborhoodId}`
          : room;
        context.io.to(emitRoom).emit("message", populatedMessage);
        console.log("✅ Backend: Socket event emitted");
      } else {
        console.log("❌ No IO in context - cannot emit socket event");
      }

      return populatedMessage;
    },
    // In your resolvers.js - FIXED VERSION

    addAffiliateLink: async (_, { url, title, description }, context) => {
      try {
        if (!context.user) {
          throw new Error("Authentication required");
        }

        const userId = context.user.id;
        console.log("🔄 Looking for user with ID:", userId);

        // Use _id for MongoDB query
        const user = await User.findById(userId);
        console.log("🔍 User found:", user ? "Yes" : "No");

        if (!user) {
          throw new Error(`User not found with ID: ${userId}`);
        }

        // Validate the affiliate link (make sure this function is defined)
        if (!validateAffiliateLink(url)) {
          throw new Error(
            "Invalid affiliate link. Must be from approved networks (impact.com, cj.com, rakuten.com, shareasale.com, awin.com, webgains.com)"
          );
        }

        const newLink = {
          url,
          title: title || "",
          description: description || "",
          clicks: 0,
        };

        user.affiliateLinks.push(newLink);
        await user.save();

        console.log("✅ Affiliate link added successfully");
        return user;
      } catch (error) {
        console.error("❌ Error in addAffiliateLink:", error);
        throw new Error(`Error adding affiliate link: ${error.message}`);
      }
    },
    // ... your other mutations

    updateProfile: async (_, { bio, profilePhoto }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const updateData = {};
      if (bio !== undefined) updateData.bio = bio;
      if (profilePhoto !== undefined) updateData.profilePhoto = profilePhoto;

      const user = await User.findByIdAndUpdate(
        context.user.userId,
        updateData,
        { new: true }
      );

      return user;
    },
    removeMember: async (_, { neighborhoodId, userId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const neighborhood = await Neighborhood.findById(neighborhoodId);
      if (!neighborhood) throw new Error("Neighborhood not found");

      // Check if user has permission (owner or moderator)
      const userRole = neighborhood.members.find(
        (member) => member.user.toString() === context.user.userId
      )?.role;

      if (!userRole || !["owner", "moderator"].includes(userRole)) {
        throw new Error("Only owners and moderators can remove members");
      }

      // Can't remove yourself or the owner
      if (userId === context.user.userId) {
        throw new Error("Cannot remove yourself");
      }

      const targetMember = neighborhood.members.find(
        (member) => member.user.toString() === userId
      );

      if (targetMember?.role === "owner") {
        throw new Error("Cannot remove the neighborhood owner");
      }
      attachMagnet: async (_, { id, magnetLink }, { user }) => {
        // optional: verify the media row belongs to the caller
        const media = await Video.findOne({ _id: id, owner: user.id });
        if (!media) throw new Error("Not found or not yours");
        return Video.findByIdAndUpdate(id, { magnetLink }, { new: true });
      },
        // Remove from members
        (neighborhood.members = neighborhood.members.filter(
          (member) => member.user.toString() !== userId
        ));

      await neighborhood.save();

      return await Neighborhood.findById(neighborhood._id)
        .populate("owner", "username profilePhoto")
        .populate("members.user", "username profilePhoto");
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

      const personalNeighborhood = new Neighborhood({
        name: `${user.username}'s Bubble`,
        description: "Your personal digital bubbledom",
        type: "personal",
        owner: user._id,
        members: [
          {
            user: user._id,
            role: "owner",
            joinedAt: new Date(),
          },
        ],
      });
      await personalNeighborhood.save();

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

    // Create a new neighborhood
    createNeighborhood: async (_, { name, description, type }, context) => {
      if (!context.user) throw new Error("Authentication required");

      // Validate neighborhood type
      const validTypes = ["personal", "private", "public", "global"];
      if (!validTypes.includes(type)) {
        throw new Error(
          `Invalid neighborhood type. Must be one of: ${validTypes.join(", ")}`
        );
      }

      const neighborhood = new Neighborhood({
        name,
        description: description || "",
        type,
        owner: context.user.userId,
        members: [
          {
            user: context.user.userId,
            role: "owner",
            joinedAt: new Date(),
          },
        ],
        rules: "",
      });

      await neighborhood.save();

      // Return populated neighborhood
      return await Neighborhood.findById(neighborhood._id)
        .populate("owner", "username profilePhoto")
        .populate("members.user", "username profilePhoto");
    },

    // Update neighborhood (owner only)
    updateNeighborhood: async (
      _,
      { id, name, description, rules },
      context
    ) => {
      if (!context.user) throw new Error("Authentication required");

      const neighborhood = await Neighborhood.findById(id);
      if (!neighborhood) throw new Error("Neighborhood not found");

      // Check if user is the owner
      if (neighborhood.owner.toString() !== context.user.userId) {
        throw new Error("Only the neighborhood owner can update settings");
      }

      // Update fields if provided
      if (name !== undefined) neighborhood.name = name;
      if (description !== undefined) neighborhood.description = description;
      if (rules !== undefined) neighborhood.rules = rules;

      await neighborhood.save();

      return await Neighborhood.findById(neighborhood._id)
        .populate("owner", "username profilePhoto")
        .populate("members.user", "username profilePhoto");
    },

    // Delete neighborhood (owner only)
    deleteNeighborhood: async (_, { id }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const neighborhood = await Neighborhood.findById(id);
      if (!neighborhood) throw new Error("Neighborhood not found");

      if (neighborhood.owner.toString() !== context.user.userId) {
        throw new Error(
          "Only the neighborhood owner can delete the neighborhood"
        );
      }

      // Soft delete by setting isActive to false
      neighborhood.isActive = false;
      await neighborhood.save();

      return true;
    },

    // Join a neighborhood
    joinNeighborhood: async (_, { neighborhoodId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const neighborhood = await Neighborhood.findById(neighborhoodId);
      if (!neighborhood || !neighborhood.isActive) {
        throw new Error("Neighborhood not found");
      }

      // Check if user is already a member
      const isAlreadyMember = neighborhood.members.some(
        (member) => member.user.toString() === context.user.userId
      );

      if (isAlreadyMember) {
        throw new Error("You are already a member of this neighborhood");
      }

      // Handle different neighborhood types
      if (neighborhood.type === "public") {
        // Auto-join public neighborhoods
        neighborhood.members.push({
          user: context.user.userId,
          role: "member",
          joinedAt: new Date(),
        });
      } else if (neighborhood.type === "private") {
        // Add to join requests for private neighborhoods
        const alreadyRequested = neighborhood.joinRequests.some(
          (request) => request.user.toString() === context.user.userId
        );

        if (!alreadyRequested) {
          neighborhood.joinRequests.push({
            user: context.user.userId,
            status: "pending",
          });
        }
      } else if (neighborhood.type === "personal") {
        throw new Error("Cannot join personal neighborhoods");
      }

      await neighborhood.save();

      return await Neighborhood.findById(neighborhood._id)
        .populate("owner", "username profilePhoto")
        .populate("members.user", "username profilePhoto")
        .populate("joinRequests.user", "username profilePhoto");
    },

    // Leave a neighborhood
    leaveNeighborhood: async (_, { neighborhoodId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const neighborhood = await Neighborhood.findById(neighborhoodId);
      if (!neighborhood) throw new Error("Neighborhood not found");

      // Can't leave if you're the owner (or implement transfer ownership)
      if (neighborhood.owner.toString() === context.user.userId) {
        throw new Error(
          "Neighborhood owner cannot leave. Transfer ownership or delete the neighborhood."
        );
      }

      // Remove from members
      neighborhood.members = neighborhood.members.filter(
        (member) => member.user.toString() !== context.user.userId
      );

      await neighborhood.save();
      return true;
    },

    // Approve join request (owner/moderator only)
    approveJoinRequest: async (_, { neighborhoodId, userId }, context) => {
      if (!context.user) throw new Error("Authentication required");

      const neighborhood = await Neighborhood.findById(neighborhoodId);
      if (!neighborhood) throw new Error("Neighborhood not found");

      // Check permissions
      const userRole = neighborhood.members.find(
        (member) => member.user.toString() === context.user.userId
      )?.role;

      if (!userRole || !["owner", "moderator"].includes(userRole)) {
        throw new Error("Only owners and moderators can approve join requests");
      }

      // Find and update the join request
      const joinRequest = neighborhood.joinRequests.find(
        (request) =>
          request.user.toString() === userId && request.status === "pending"
      );

      if (!joinRequest) throw new Error("Join request not found");

      joinRequest.status = "approved";

      // Add to members
      neighborhood.members.push({
        user: userId,
        role: "member",
        joinedAt: new Date(),
      });

      await neighborhood.save();

      return await Neighborhood.findById(neighborhood._id)
        .populate("owner", "username profilePhoto")
        .populate("members.user", "username profilePhoto")
        .populate("joinRequests.user", "username profilePhoto");
    },
  },

  // Field resolvers - COMPLETE VERSION
  // Field resolvers - SIMPLIFIED _id to id conversion
  User: {
    id: (parent) => parent._id?.toString() || parent.id,
  },
  Chat: {
    id: (parent) => parent._id?.toString() || parent.id,
  },
  Message: {
    id: (parent) => parent._id?.toString() || parent.id,
    neighborhood: async (parent) => {
      if (!parent.neighborhood) return null;

      // If already populated, ensure it has proper id field
      if (parent.neighborhood && typeof parent.neighborhood === "object") {
        const neighborhood = parent.neighborhood;
        return {
          ...neighborhood,
          id: neighborhood._id?.toString() || neighborhood.id,
        };
      }

      // Otherwise populate it
      try {
        const neighborhood = await Neighborhood.findById(parent.neighborhood);
        return neighborhood
          ? {
              ...neighborhood.toObject(),
              id: neighborhood._id.toString(),
            }
          : null;
      } catch (error) {
        console.error("Error populating message neighborhood:", error);
        return null;
      }
    },
    sender: async (parent) => {
      // If already populated, ensure it has proper id field
      if (parent.sender && typeof parent.sender === "object") {
        const sender = parent.sender;
        return {
          ...sender,
          id: sender._id?.toString() || sender.id,
        };
      }

      // If no sender ID, return a fallback user
      if (!parent.sender) {
        return {
          id: "unknown",
          username: "Unknown User",
          profilePhoto: "https://via.placeholder.com/40",
        };
      }

      // Otherwise populate it
      try {
        const user = await User.findById(parent.sender);
        if (!user) {
          return {
            id: "deleted",
            username: "Deleted User",
            profilePhoto: "https://via.placeholder.com/40",
          };
        }
        return {
          ...user.toObject(),
          id: user._id.toString(),
        };
      } catch (error) {
        console.error("Error populating message sender:", error);
        return {
          id: "error",
          username: "Error Loading User",
          profilePhoto: "https://via.placeholder.com/40",
        };
      }
    },
  },
  Post: {
    id: (parent) => parent._id?.toString() || parent.id,
  },
  Group: {
    id: (parent) => parent._id?.toString() || parent.id,
  },
  Video: {
    id: (parent) => parent._id?.toString() || parent.id,
  },
  Stream: {
    id: (parent) => parent._id?.toString() || parent.id,
  },
  Ad: {
    id: (parent) => parent._id?.toString() || parent.id,
  },
  AffiliateLink: {
    id: (parent) => parent._id?.toString() || parent.id,
  },
  Comment: {
    id: (parent) => parent._id?.toString() || parent.id,
    author: async (parent) => {
      if (parent.author && typeof parent.author === "object") {
        const author = parent.author;
        return {
          ...author,
          id: author._id?.toString() || author.id,
        };
      }
      const user = await User.findById(parent.author);
      return user
        ? {
            ...user.toObject(),
            id: user._id.toString(),
          }
        : null;
    },
  },
  Neighborhood: {
    id: (parent) => parent._id?.toString() || parent.id,
    owner: async (parent) => {
      // If already populated, ensure it has proper id field
      if (parent.owner && typeof parent.owner === "object") {
        const owner = parent.owner;
        return {
          ...owner,
          id: owner._id?.toString() || owner.id,
        };
      }

      // Otherwise populate it
      try {
        const user = await User.findById(parent.owner);
        return user
          ? {
              ...user.toObject(),
              id: user._id.toString(),
            }
          : null;
      } catch (error) {
        console.error("Error populating neighborhood owner:", error);
        return null;
      }
    },
    members: async (parent) => {
      // Ensure all members have proper id fields
      return parent.members.map((member) => ({
        ...member,
        user:
          member.user && typeof member.user === "object"
            ? {
                ...member.user,
                id: member.user._id?.toString() || member.user.id,
              }
            : member.user,
      }));
    },
  },
  NeighborhoodMember: {
    user: async (parent) => {
      if (parent.user && typeof parent.user === "object") {
        const user = parent.user;
        return {
          ...user,
          id: user._id?.toString() || user.id,
        };
      }
      const user = await User.findById(parent.user);
      return user
        ? {
            ...user.toObject(),
            id: user._id.toString(),
          }
        : null;
    },
    role: (parent) => parent.role,
    joinedAt: (parent) => parent.joinedAt.toISOString(),
  },
  JoinRequest: {
    user: async (parent) => {
      if (parent.user && typeof parent.user === "object") {
        const user = parent.user;
        return {
          ...user,
          id: user._id?.toString() || user.id,
        };
      }
      const user = await User.findById(parent.user);
      return user
        ? {
            ...user.toObject(),
            id: user._id.toString(),
          }
        : null;
    },
    requestedAt: (parent) => parent.requestedAt.toISOString(),
    status: (parent) => parent.status,
  },
};

export default resolvers;
