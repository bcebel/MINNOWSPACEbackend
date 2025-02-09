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
  },
};

export default resolvers;