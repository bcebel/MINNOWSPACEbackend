import User from "../../models/User.js";
import Chat from "../../models/Chat.js";
import Post from "../../models/Post.js";
import Group from "../../models/Group.js";
import Video from "../../models/Video.js";
import Stream from "../../models/Stream.js";
import Ad from "../../models/Ad.js";
import Neighborhood from "../../models/Neighborhood.js";
import Message from "../../models/Message.js";
import Image from "../../models/Image.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import crypto from "crypto";

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

const validateAndExtractAffiliateHtml = (html) => {
  const allowedDomains = [
    "anrdoezrs.net",
    "tkqlhce.com",
    "jdoqocy.com",
    "tqlkg.com",
    "ftjcfx.com",
    "awltovhc.com",
    "kqzyfj.com",
  ];

  const domainPattern = allowedDomains.join("|");

  // Find ALL URLs
  const urlRegex = /https?:\/\/[^\s"']+/gi;
  const allUrls = html.match(urlRegex) || [];

  // Check each URL against approved domains
  const approvedUrls = allUrls.filter((url) =>
    url.match(new RegExp(`https://www\\.(${domainPattern})/`, "i"))
  );

  // Must have exactly 2 approved URLs and no other URLs
  const hasCorrectUrlCount = approvedUrls.length === 2 && allUrls.length === 2;

  // Additionally validate basic HTML structure
  const hasValidStructure =
    html.includes("<a href=") &&
    html.includes('target="_top"') &&
    html.includes("<img src=") &&
    html.includes("</a>");

  // If validation passes, extract the data
  if (hasCorrectUrlCount && hasValidStructure) {
    // Extract URLs
    const hrefMatch = html.match(/href="([^"]*)"/);
    const srcMatch = html.match(/src="([^"]*)"/);
    const altMatch = html.match(/alt="([^"]*)"/);
    const titleMatch = html.match(/title="([^"]*)"/);

    // Extract text between > and < (link text)
    const textMatch = html.match(/>([^<]+)</);
    const linkText = textMatch ? textMatch[1].trim() : null;

    return {
      isValid: true,
      data: {
        url: hrefMatch ? hrefMatch[1] : approvedUrls[0],
        imageUrl: srcMatch ? srcMatch[1] : approvedUrls[1] || null,
        title: altMatch
          ? altMatch[1]
          : titleMatch
          ? titleMatch[1]
          : linkText || "Affiliate Link",
        description: "",
      },
    };
  }

  return {
    isValid: false,
    error: "Invalid affiliate HTML format",
  };
};

const resolvers = {
  Query: {
    // User queries
    images: async () => await Image.find().populate("user"),
    image: async (_, { id }) => await Image.findById(id).populate("user"),
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

    // In resolvers.js - Update randomAffiliateLink
    randomAffiliateLink: async (_, __, context) => {
      try {
        // Get all users with affiliate links
        const usersWithLinks = await User.find({
          "affiliateLinks.0": { $exists: true },
        }).select("affiliateLinks");

        if (usersWithLinks.length === 0) return null;

        // Flatten all links
        const allLinks = [];
        usersWithLinks.forEach((user) => {
          user.affiliateLinks.forEach((link) => {
            // Ensure link is properly formatted
            if (link && link.url) {
              allLinks.push({
                id: link._id ? link._id.toString() : Math.random().toString(36),
                url: link.url,
                title: link.title || "",
                description: link.description || "",
                imageUrl: link.imageUrl || null,
                clicks: link.clicks || 0,
              });
            }
          });
        });

        if (allLinks.length === 0) return null;

        // Pick random link
        const randomIndex = Math.floor(Math.random() * allLinks.length);
        return allLinks[randomIndex];
      } catch (error) {
        console.error("Error in randomAffiliateLink:", error);
        return null;
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
    // Update your getNeighborhoodVideos resolver
    getNeighborhoodVideos: async (_, { neighborhoodId }, { user }) => {
      try {
        if (!user) throw new Error("Authentication required");

        console.log("🏘️ Fetching videos FOR neighborhood:", neighborhoodId);

        // 1. Verify user has access
        const neighborhood = await Neighborhood.findOne({
          _id: neighborhoodId,
          $or: [{ owner: user.userId }, { "members.user": user.userId }],
        });

        if (!neighborhood) throw new Error("Access denied to neighborhood");

        // 2. ✅ CRITICAL: Only get videos WITH this neighborhood ID
        const videos = await Video.find({
          neighborhood: neighborhoodId, // This is the key filter!
        })
          .populate("user", "username profilePhoto")
          .populate("neighborhood", "name description")
          .sort({ createdAt: -1 });

        console.log(
          `✅ Found ${videos.length} videos SHARED TO neighborhood ${neighborhoodId}`
        );
        return videos;
      } catch (error) {
        console.error("❌ Error:", error);
        throw error;
      }
    },

    // Add this resolver for neighborhood images
    getNeighborhoodImages: async (_, { neighborhoodId }, { user }) => {
      try {
        if (!user) throw new Error("Authentication required");

        // Verify access
        const neighborhood = await Neighborhood.findOne({
          _id: neighborhoodId,
          $or: [{ owner: user.userId }, { "members.user": user.userId }],
        });

        if (!neighborhood) throw new Error("Access denied to neighborhood");

        // Get images shared to this neighborhood
        const images = await Image.find({
          neighborhood: neighborhoodId, // Only images shared here
        })
          .populate("user", "username profilePhoto")
          .populate("neighborhood", "name description")
          .sort({ createdAt: -1 });

        return images;
      } catch (error) {
        console.error("Error getting neighborhood images:", error);
        throw error;
      }
    },

    // New combined resolver
    // Replace your current getNeighborhoodGallery resolver with this:
    getNeighborhoodGallery: async (_, { neighborhoodId }, { user }) => {
      try {
        if (!user) throw new Error("Authentication required");

        console.log("🎨 Fetching gallery for neighborhood:", neighborhoodId);

        // Verify access
        const neighborhood = await Neighborhood.findOne({
          _id: neighborhoodId,
          $or: [{ owner: user.userId }, { "members.user": user.userId }],
        });

        if (!neighborhood) {
          console.log("❌ Access denied or neighborhood not found");
          throw new Error("Access denied to neighborhood");
        }

        console.log("✅ Access granted to neighborhood:", neighborhood.name);

        // Get videos from this neighborhood
        const videos = await Video.find({ neighborhood: neighborhoodId })
          .populate("user", "username profilePhoto")
          .populate("neighborhood", "name description");

        // Get images from this neighborhood
        const images = await Image.find({ neighborhood: neighborhoodId })
          .populate("user", "username profilePhoto")
          .populate("neighborhood", "name description");

        console.log(
          `📊 Found: ${videos.length} videos, ${images.length} images`
        );

        // Return as GalleryResponse object
        return {
          videos: videos,
          images: images,
          totalCount: videos.length + images.length,
        };
      } catch (error) {
        console.error("❌ Error in getNeighborhoodGallery:", error);
        throw error;
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
    validateInviteLink: async (_, { code }) => {
      const neighborhood = await Neighborhood.findOne({
        "inviteLinks.code": code,
        "inviteLinks.isActive": true,
      })
        .populate("owner", "username profilePhoto")
        .populate("inviteLinks.createdBy", "username profilePhoto");
      
      if (!neighborhood) {
        return {
          isValid: false,
          message: "Invalid invite link",
        };
      }
      
      const link = neighborhood.inviteLinks.find(link => link.code === code);
      
      if (!link) {
        return {
          isValid: false,
          message: "Invalid invite link",
        };
      }
      
      // Check if link is expired
      if (link.expiresAt && link.expiresAt < new Date()) {
        return {
          isValid: false,
          message: "This invite link has expired",
        };
      }
      
      // Check if link has reached max uses
      if (link.maxUses > 0 && link.uses >= link.maxUses) {
        return {
          isValid: false,
          message: "This invite link has reached its maximum uses",
        };
      }
      
      return {
        isValid: true,
        message: "Valid invite link",
        link: {
          ...link.toObject(),
          id: link._id.toString(),
        },
        neighborhood: {
          id: neighborhood._id.toString(),
          name: neighborhood.name,
          description: neighborhood.description,
          type: neighborhood.type,
          owner: neighborhood.owner,
          memberCount: neighborhood.members.length,
        },
      };
    },
    
    // Get invite links for a neighborhood
    neighborhoodInviteLinks: async (_, { neighborhoodId }, context) => {
      if (!context.user) throw new Error("Authentication required");
      
      const neighborhood = await Neighborhood.findById(neighborhoodId)
        .populate("inviteLinks.createdBy", "username profilePhoto");
      
      if (!neighborhood) throw new Error("Neighborhood not found");
      
      // Check if user has permission to view links
      const userRole = neighborhood.members.find(
        member => member.user.toString() === context.user.userId
      )?.role;
      
      if (!["owner", "moderator"].includes(userRole)) {
        throw new Error("Only owners and moderators can view invite links");
      }
      
      return neighborhood.inviteLinks.map(link => ({
        ...link.toObject(),
        id: link._id.toString(),
        url: `${process.env.APP_URL || 'https://yourapp.com'}/join/${link.code}`,
      }));
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
        thumbnailUrl,
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
        thumbnailUrl,
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
        thumbnailUrl: thumbnailUrl || null,
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
        if (!validateAffiliateHtml(html)) {
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

        const user = await User.findById(context.user.userId);
        if (!user) throw new Error("User not found");

        // Update basic profile fields
        if (bio !== undefined) user.bio = bio;
        if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;

        // Add affiliate links if provided
        if (affiliateLinks && affiliateLinks.length > 0) {
          console.log("📝 Processing affiliate links:", affiliateLinks);

          // Clear existing links and add new ones
          user.affiliateLinks = [];

          for (const link of affiliateLinks) {
            if (link.url && link.url.trim()) {
              // Check if it's HTML that needs validation/extraction
              if (link.url.includes('<a href="')) {
                // Validate and extract from HTML
                const result = validateAndExtractAffiliateHtml(link.url);

                if (!result.isValid) {
                  throw new Error(
                    `Invalid affiliate link format: ${result.error}`
                  );
                }

                // Use extracted data
                const newLink = {
                  url: result.data.url,
                  title: result.data.title,
                  description:
                    link.description || result.data.description || "",
                  imageUrl: result.data.imageUrl,
                  clicks: 0,
                };

                user.affiliateLinks.push(newLink);
                console.log(
                  "✅ Validated and extracted affiliate link:",
                  newLink
                );
              } else {
                // It's already a clean URL, use as-is
                const newLink = {
                  url: link.url,
                  title: link.title || "Affiliate Link",
                  description: link.description || "",
                  imageUrl: link.imageUrl || null, // Use provided imageUrl if available
                  clicks: 0,
                };

                user.affiliateLinks.push(newLink);
                console.log("✅ Added clean affiliate link:", newLink);
              }
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

    createInviteLink: async (_, { 
      neighborhoodId, 
      name = "Invite Link", 
      maxUses = 0,
      expiresInDays,
      role = "member" 
    }, context) => {
      if (!context.user) throw new Error("Authentication required");
      
      const neighborhood = await Neighborhood.findById(neighborhoodId);
      if (!neighborhood) throw new Error("Neighborhood not found");
      
      // Check if user has permission to create links
      const userRole = neighborhood.members.find(
        member => member.user.toString() === context.user.userId
      )?.role;
      
      if (!["owner", "moderator"].includes(userRole)) {
        throw new Error("Only owners and moderators can create invite links");
      }
      
      // Calculate expiration date if provided
      let expiresAt = null;
      if (expiresInDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }
      
      // Create the link
      const link = await neighborhood.createInviteLink({
        createdBy: context.user.userId,
        name,
        maxUses,
        expiresAt,
        role,
      });
      
      // Populate and return
      const savedNeighborhood = await Neighborhood.findById(neighborhood._id)
        .populate("inviteLinks.createdBy", "username profilePhoto");
      
      const savedLink = savedNeighborhood.inviteLinks.id(link._id);
      
      return {
        ...savedLink.toObject(),
        id: savedLink._id.toString(),
        url: `${process.env.APP_URL || 'https://yourapp.com'}/join/${savedLink.code}`,
      };
    },
    
    // Update an invite link
    updateInviteLink: async (_, { linkId, name, maxUses, expiresAt, isActive }, context) => {
      if (!context.user) throw new Error("Authentication required");
      
      const neighborhood = await Neighborhood.findOne({
        "inviteLinks._id": linkId,
      });
      
      if (!neighborhood) throw new Error("Invite link not found");
      
      // Check if user has permission
      const userRole = neighborhood.members.find(
        member => member.user.toString() === context.user.userId
      )?.role;
      
      if (!["owner", "moderator"].includes(userRole)) {
        throw new Error("Only owners and moderators can update invite links");
      }
      
      const link = neighborhood.inviteLinks.id(linkId);
      if (!link) throw new Error("Invite link not found");
      
      // Update fields
      if (name !== undefined) link.name = name;
      if (maxUses !== undefined) link.maxUses = maxUses;
      if (expiresAt !== undefined) link.expiresAt = expiresAt;
      if (isActive !== undefined) link.isActive = isActive;
      
      await neighborhood.save();
      
      // Populate and return
      const savedNeighborhood = await Neighborhood.findById(neighborhood._id)
        .populate("inviteLinks.createdBy", "username profilePhoto");
      
      const savedLink = savedNeighborhood.inviteLinks.id(linkId);
      
      return {
        ...savedLink.toObject(),
        id: savedLink._id.toString(),
        url: `${process.env.APP_URL || 'https://yourapp.com'}/join/${savedLink.code}`,
      };
    },
    
    // Delete an invite link
    deleteInviteLink: async (_, { linkId }, context) => {
      if (!context.user) throw new Error("Authentication required");
      
      const neighborhood = await Neighborhood.findOne({
        "inviteLinks._id": linkId,
      });
      
      if (!neighborhood) throw new Error("Invite link not found");
      
      // Check if user has permission
      const userRole = neighborhood.members.find(
        member => member.user.toString() === context.user.userId
      )?.role;
      
      if (!["owner", "moderator"].includes(userRole)) {
        throw new Error("Only owners and moderators can delete invite links");
      }
      
      const link = neighborhood.inviteLinks.id(linkId);
      if (!link) throw new Error("Invite link not found");
      
      link.remove();
      await neighborhood.save();
      
      return true;
    },
    
    // Public: Join a neighborhood via invite link (user must be authenticated)
    joinViaInviteLink: async (_, { code }, context) => {
      if (!context.user) {
        return {
          success: false,
          message: "Authentication required. Please log in or create an account.",
          error: "NOT_AUTHENTICATED",
        };
      }
      
      const neighborhood = await Neighborhood.findOne({
        "inviteLinks.code": code,
        "inviteLinks.isActive": true,
      })
        .populate("owner", "username profilePhoto");
      
      if (!neighborhood) {
        return {
          success: false,
          message: "Invalid invite link",
          error: "INVALID_LINK",
        };
      }
      
      const link = neighborhood.inviteLinks.find(link => link.code === code);
      
      if (!link) {
        return {
          success: false,
          message: "Invalid invite link",
          error: "INVALID_LINK",
        };
      }
      
      // Check if link is expired
      if (link.expiresAt && link.expiresAt < new Date()) {
        return {
          success: false,
          message: "This invite link has expired",
          error: "LINK_EXPIRED",
        };
      }
      
      // Check if link has reached max uses
      if (link.maxUses > 0 && link.uses >= link.maxUses) {
        return {
          success: false,
          message: "This invite link has reached its maximum uses",
          error: "MAX_USES_REACHED",
        };
      }
      
      // Check if user is already a member
      const isAlreadyMember = neighborhood.members.some(
        member => member.user.toString() === context.user.userId
      );
      
      if (isAlreadyMember) {
        return {
          success: false,
          message: "You are already a member of this neighborhood",
          error: "ALREADY_MEMBER",
          neighborhood: {
            id: neighborhood._id.toString(),
            name: neighborhood.name,
          },
        };
      }
      
      // Check if neighborhood has reached max members
      if (neighborhood.members.length >= neighborhood.maxMembers) {
        return {
          success: false,
          message: "This neighborhood has reached its maximum member limit",
          error: "NEIGHBORHOOD_FULL",
        };
      }
      
      // Add user as member with specified role
      neighborhood.members.push({
        user: context.user.userId,
        role: link.role,
        joinedAt: new Date(),
      });
      
      // Increment link uses
      link.uses += 1;
      
      // Add to user's join history
      const user = await User.findById(context.user.userId);
      user.joinedViaLink.push({
        neighborhood: neighborhood._id,
        linkCode: code,
        joinedAt: new Date(),
      });
      
      await Promise.all([neighborhood.save(), user.save()]);
      
      return {
        success: true,
        message: `Successfully joined ${neighborhood.name}!`,
        neighborhood: await Neighborhood.findById(neighborhood._id)
          .populate("owner", "username profilePhoto")
          .populate("members.user", "username profilePhoto"),
      };
    },
    
    // Public: Register and join via link in one step
    registerAndJoinViaLink: async (_, { code, username, email, password }) => {
      // First, validate the invite link
      const neighborhood = await Neighborhood.findOne({
        "inviteLinks.code": code,
        "inviteLinks.isActive": true,
      });
      
      if (!neighborhood) {
        throw new Error("Invalid invite link");
      }
      
      const link = neighborhood.inviteLinks.find(link => link.code === code);
      
      if (!link) {
        throw new Error("Invalid invite link");
      }
      
      // Check link validity
      if (link.expiresAt && link.expiresAt < new Date()) {
        throw new Error("This invite link has expired");
      }
      
      if (link.maxUses > 0 && link.uses >= link.maxUses) {
        throw new Error("This invite link has reached its maximum uses");
      }
      
      // Check if email/username already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }],
      });
      
      if (existingUser) {
        throw new Error("User with this email or username already exists");
      }
      
      // Create the user
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
        joinedViaLink: [{
          neighborhood: neighborhood._id,
          linkCode: code,
          joinedAt: new Date(),
        }],
      });
      
      await user.save();
      
      // Add user to neighborhood
      neighborhood.members.push({
        user: user._id,
        role: link.role,
        joinedAt: new Date(),
      });
      
      // Increment link uses
      link.uses += 1;
      
      await neighborhood.save();
      
      // Generate auth token
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });
      
      return {
        token,
        user,
      };
    },
  },
  
  // Field resolvers
  InviteLink: {
    url: (parent) => {
      return `${process.env.APP_URL || 'https://yourapp.com'}/join/${parent.code}`;
    },
    createdBy: async (parent, _, context) => {
      if (parent.createdBy) {
        return parent.createdBy;
      }
      // If not populated, fetch it
      const user = await User.findById(parent.createdBy).select("username profilePhoto");
      return user;
    },
  },
};

export default resolvers;
