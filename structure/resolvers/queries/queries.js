import mutationResolvers from "../mutations/mutations.js";
import User from "../../models/Minnow.js";
import Video from "../../models/Video.js";
import Stream from "../../models/Stream.js";
import Ad from "../../models/Ad.js"; // ← ADD
import Chat from "../../models/Chat.js"; // ← ADD
import Post from "../../models/Post.js"; // ← ADD
import Group from "../../models/Group.js"; // ← ADD

const validateAffiliateLink = (link) => {
  const regex = /^(https?:\/\/)(www\.)?(impact\.com|cj\.com|rakuten\.com)\/.*$/;
  return regex.test(link);
};

const resolvers = {
  Query: {
    users: async () => await User.find(),
    user: async (_, { id }) => await User.findById(id),
    videos: async () => await Video.find(),
    video: async (_, { id }) => await Video.findById(id),
    streams: async () => await Stream.find(),
    stream: async (_, { id }) => await Stream.findById(id),
    ads: async () => await Ad.find(),
    ad: async (_, { id }) => await Ad.findById(id),
    chats: async () => await Chat.find(),
    chat: async (_, { id }) => await Chat.findById(id),
    posts: async (_, { feedType, groupId }) => {
      if (feedType) return await Post.find({ feedType });
      if (groupId) return await Post.find({ group: groupId });
      return await Post.find();
    },
    post: async (_, { id }) => await Post.findById(id),
    groups: async () => await Group.find(),
    group: async (_, { id }) => await Group.findById(id),
    messages: async (_, { room }, context) => {
      if (!context.user) throw new Error("Authentication required");

      // Use your Message model to fetch messages
      const messages = await Message.find({ room: room || "general" })
        .populate("sender", "username profilePhoto")
        .sort("-createdAt")
        .limit(50);

      return messages;
    },
  },
  Mutation: {
    // Spread in all your existing mutations
    ...mutationResolvers.Mutation,

    // Add your NEW affiliate link mutation (for array of links)
    addAffiliateLink: async (_, { userId, url, title }) => {
      try {
        if (!validateAffiliateLink(url)) {
          throw new Error(
            "Invalid affiliate link. Must be from approved networks"
          );
        }

        const user = await User.findById(userId);
        if (!user) throw new Error("User not found");

        const newLink = {
          url,
          title: title || "",
          description: "",
          clicks: 0,
        };

        user.affiliateLinks.push(newLink);
        await user.save();

        return user;
      } catch (error) {
        throw new Error(`Error adding affiliate link: ${error.message}`);
      }
    },
  },
};

export default resolvers;
