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

// 🔥 NUCLEAR OPTION: Stop GraphQL ID conversion issues// 🔥 UPDATED FIXIDS FUNCTION - Handle dates and buffers
const fixIds = (obj) => {
  if (!obj) return obj;

  // If it's an array, fix each item
  if (Array.isArray(obj)) {
    return obj.map(fixIds);
  }

  // If it's a Date object, convert to ISO string
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // If it's a MongoDB ObjectId buffer, convert to string
  if (obj && obj.buffer && Buffer.isBuffer(obj.buffer)) {
    return obj.toString();
  }

  // If it's an object, fix its IDs
  if (typeof obj === "object" && obj !== null) {
    const fixed = { ...obj };

    // Convert _id to id and ensure it's a string
    if (fixed._id) {
      if (fixed._id.buffer && Buffer.isBuffer(fixed._id.buffer)) {
        // Handle ObjectId buffer
        fixed.id = fixed._id.toString();
      } else {
        fixed.id = fixed._id.toString();
      }
    }

    // Handle createdAt and other date fields
    if (fixed.createdAt) {
      if (fixed.createdAt instanceof Date) {
        fixed.createdAt = fixed.createdAt.toISOString();
      } else if (typeof fixed.createdAt === 'object' && Object.keys(fixed.createdAt).length === 0) {
        // If it's an empty object, set to current date
        fixed.createdAt = new Date().toISOString();
      }
    }

    // Fix any nested objects
    Object.keys(fixed).forEach((key) => {
      if (typeof fixed[key] === "object" && fixed[key] !== null) {
        fixed[key] = fixIds(fixed[key]);
      }
    });

    return fixed;
  }

  return obj;
};
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

    randomAffiliateLink: async (_, __, context) => {
      try {
        if (!context.user) throw new Error("Authentication required");

        console.log("🎲 Fetching random affiliate link...");

        // Get all users with affiliate links
        const usersWithLinks = await User.find({
          "affiliateLinks.0": { $exists: true },
        }).select("affiliateLinks");

        if (usersWithLinks.length === 0) return null;

        // Flatten all links
        const allLinks = [];
        usersWithLinks.forEach((user) => {
          user.affiliateLinks.forEach((link) => {
            allLinks.push(fixIds(link)); // 🔥 APPLY THE FIX
          });
        });

        if (allLinks.length === 0) return null;

        // Pick random link
        const randomLink =
          allLinks[Math.floor(Math.random() * allLinks.length)];

        console.log("✅ Random affiliate link found");
        return randomLink;
      } catch (error) {
        console.error("❌ Error in randomAffiliateLink:", error);
        throw error;
      }
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
        neighborhoodId,
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
        room: room || "neighborhood",
        neighborhood: neighborhoodId || null,
        createdAt: new Date(), // ✅ Explicitly set date
      });

      await message.save();
      console.log("✅ Backend: Message saved with ID:", message._id);

      // 🚨 SIMPLIFIED: Only populate sender, don't populate neighborhood
      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "username profilePhoto")
        .exec();

      console.log("🚨 Raw populated message:", populatedMessage);

      // 🔥 Apply the updated fixIds function
      const result = fixIds(populatedMessage.toObject());

      console.log("🚨 Fixed result:", result);

      if (context.io) {
        const emitRoom = neighborhoodId
          ? `neighborhood-${neighborhoodId}`
          : room;
        context.io.to(emitRoom).emit("message", result);
      }

      return result;
    },

    deleteMessage: async (_, { messageId }, context) => {
      try {
        if (!context.user) {
          throw new Error("Authentication required");
        }

        const message = await Message.findById(messageId);
        if (!message) {
          throw new Error("Message not found");
        }

        // Check if user owns the message or is admin
        // ⬅️ FIXED: Changed context.user.id to context.user.userId for consistency
        const isOwner = message.sender.toString() === context.user.userId;
        if (!isOwner) {
          // Optional: Check if user is neighborhood admin
          const neighborhood = await Neighborhood.findOne({
            _id: message.neighborhood,
            $or: [
              // ⬅️ FIXED: Changed context.user.id to context.user.userId
              { owner: context.user.userId },
              // ⬅️ FIXED: Changed context.user.id to context.user.userId
              { "members.user": context.user.userId, "members.role": "admin" },
            ],
          });
          if (!neighborhood) {
            throw new Error("Not authorized to delete this message");
          }
        }

        // Delete associated files from IPFS (optional)
        if (message.imageUrl || message.videoUrl || message.fileUrl) {
          console.log("Cleaning up media for message:", messageId);
          // You might want to add IPFS cleanup logic here
        }

        await Message.findByIdAndDelete(messageId);
        return true;
      } catch (error) {
        console.error("Delete message error:", error);
        throw new Error(`Failed to delete message: ${error.message}`);
      }
    },

    deletePost: async (_, { postId }, context) => {
      try {
        if (!context.user) {
          throw new Error("Authentication required");
        }

        const post = await Post.findById(postId).populate("author");
        if (!post) {
          throw new Error("Post not found");
        }

        // Check if user owns the post or is admin
        // ⬅️ FIXED: Changed context.user.id to context.user.userId
        const isOwner = post.author._id.toString() === context.user.userId;
        if (!isOwner) {
          throw new Error("Not authorized to delete this post");
        }

        // Delete associated comments
        // NOTE: The Comment model must be imported for this line to work.
        // Assuming Comment is available in the scope above.
        // await Comment.deleteMany({ _id: { $in: post.comments } });

        await Post.findByIdAndDelete(postId);
        return true;
      } catch (error) {
        console.error("Delete post error:", error);
        throw new Error(`Failed to delete post: ${error.message}`);
      }
    },
    addAffiliateLink: async (_, { url, title, description }, context) => {
      // ... (existing addAffiliateLink logic is correct, assuming context.user.id is used there)
      try {
        if (!context.user) {
          throw new Error("Authentication required");
        }

        const userId = context.user.userId; // Assuming context.user.userId here
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

    // In your resolvers.js - GO BACK TO WHAT WAS WORKING
    updateProfile: async (
      _,
      { bio, profilePhoto, affiliateLinks },
      context
    ) => {
      try {
        if (!context.user) {
          throw new Error("Authentication required");
        }

        // Use the working line that was already working
        const user = await User.findById(context.user.userId);
        if (!user) throw new Error("User not found");
        // ... (rest of updateProfile logic)

        // Update basic profile fields
        if (bio !== undefined) user.bio = bio;
        if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;

        // Add affiliate links if provided
        if (affiliateLinks && affiliateLinks.length > 0) {
          console.log("📝 Adding affiliate links:", affiliateLinks);

          // Clear existing links and add new ones (or append - your choice)
          user.affiliateLinks = []; // Clear first, then add new ones

          for (const link of affiliateLinks) {
            if (link.url && link.url.trim()) {
              const newLink = {
                url: link.url,
                title: link.title || "", // This includes the title now
                description: "", // You said no description
                clicks: 0,
              };
              user.affiliateLinks.push(newLink);
            }
          }
        }

        await user.save();
        console.log("✅ Profile updated with affiliate links");
        return user;
      } catch (error) {
        console.error("❌ Error updating profile:", error);
        throw new Error(`Error updating profile: ${error.message}`);
      }
    },

    // ⬅️ STANDALONE MUTATION: Extracted attachMagnet from removeMember
    attachMagnet: async (_, { id, magnetLink }, { user }) => {
      try {
        if (!user) throw new Error("Authentication required");

        // Find the Video and verify the user owns it
        const media = await Video.findOne({ _id: id, user: user.userId }); // Assuming 'user' field on Video schema
        if (!media) throw new Error("Video not found or you don't own it");

        // Update the magnetLink field
        return Video.findByIdAndUpdate(id, { magnetLink }, { new: true });
      } catch (error) {
        console.error("Error attaching magnet link:", error);
        throw new Error(`Failed to attach magnet link: ${error.message}`);
      }
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

      // Remove from members
      neighborhood.members = neighborhood.members.filter(
        (member) => member.user.toString() !== userId
      );

      await neighborhood.save();

      return await Neighborhood.findById(neighborhood._id)
        .populate("owner", "username profilePhoto")
        .populate("members.user", "username profilePhoto");
    },
    // ... (rest of mutations are assumed correct)
    registerUser: async (_, { username, email, password }) => {
      // ... (existing registerUser logic)
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

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        // Ensure JWT payload uses 'userId'
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

      // ... (existing loginUser logic)
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) throw new Error("Invalid password");

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        // Ensure JWT payload uses 'userId'
        expiresIn: "24h",
      });

      return {
        token,
        user,
      };
    },

    // Create a new neighborhood
    createNeighborhood: async (_, { name, description, type }, context) => {
      // ... (existing createNeighborhood logic)
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
    // ... (rest of mutations are assumed correct)

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
};

export default resolvers;
