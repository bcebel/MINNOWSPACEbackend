const resolvers = {
  Mutation: {
    sendMessage: async (_, { chatId, senderId, content }) => {
      const message = { sender: senderId, content, timestamp: new Date() };
      const chat = await Chat.findByIdAndUpdate(
        chatId,
        { $push: { messages: message } },
        { new: true }
      );
      return chat;
    },
    createPost: async (_, { authorId, content, feedType, groupId }) => {
      const post = new Post({
        author: authorId,
        content,
        feedType,
        group: groupId,
      });
      await post.save();
      await User.findByIdAndUpdate(authorId, { $push: { posts: post._id } });
      if (groupId)
        await Group.findByIdAndUpdate(groupId, { $push: { posts: post._id } });
      return post;
    },
    likePost: async (_, { postId, userId }) => {
      const post = await Post.findByIdAndUpdate(
        postId,
        { $addToSet: { likes: userId } }, // Prevents duplicate likes
        { new: true }
      );
      return post;
    },
    addComment: async (_, { postId, authorId, content }) => {
      const comment = { author: authorId, content, timestamp: new Date() };
      const post = await Post.findByIdAndUpdate(
        postId,
        { $push: { comments: comment } },
        { new: true }
      );
      return post;
    },
    createGroup: async (_, { name, description, creatorId }) => {
      const group = new Group({ name, description, members: [creatorId] });
      await group.save();
      await User.findByIdAndUpdate(creatorId, { $push: { groups: group._id } });
      return group;
    },
    joinGroup: async (_, { groupId, userId }) => {
      const group = await Group.findByIdAndUpdate(
        groupId,
        { $addToSet: { members: userId } }, // Prevents duplicate members
        { new: true }
      );
      await User.findByIdAndUpdate(userId, { $push: { groups: group._id } });
      return group;
    },
    registerUser: async (_, { username, email, password }) => {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({ username, email, password: hashedPassword });
      await user.save();
      return user;
    },
    loginUser: async (_, { email, password }) => {
      const user = await User.findOne({ email });
      if (!user) throw new Error("User not found");
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) throw new Error("Invalid password");
      const token = jwt.sign({ userId: user._id }, "SECRET_KEY");
      return { token, user };
    },
    updateAffiliateLink: async (_, { userId, affiliateLink }) => {
      const isValidLink = validateAffiliateLink(affiliateLink); // Use regex to validate
      if (!isValidLink) throw new Error("Invalid affiliate link");
      const user = await User.findByIdAndUpdate(
        userId,
        { affiliateLink },
        { new: true }
      );
      return user;
    },
    addVideo: async (
      _,
      { userId, title, description, youtubeVideoId, thumbnail }
    ) => {
      const video = new Video({
        title,
        description,
        youtubeVideoId,
        thumbnail,
        user: userId,
      });
      await video.save();
      await User.findByIdAndUpdate(userId, { $push: { videos: video._id } });
      return video;
    },
    addStream: async (
      _,
      { userId, title, description, youtubeStreamId, isLive }
    ) => {
      const stream = new Stream({
        title,
        description,
        youtubeStreamId,
        isLive,
        user: userId,
      });
      await stream.save();
      await User.findByIdAndUpdate(userId, { $push: { streams: stream._id } });
      return stream;
    },
    addAd: async (_, { userId, affiliateLink }) => {
      const isValidLink = validateAffiliateLink(affiliateLink); // Use regex to validate
      if (!isValidLink) throw new Error("Invalid affiliate link");
      const ad = new Ad({ affiliateLink, user: userId });
      await ad.save();
      return ad;
    },
    incrementAdClicks: async (_, { adId }) => {
      const ad = await Ad.findByIdAndUpdate(
        adId,
        { $inc: { clicks: 1 } },
        { new: true }
      );
      return ad;
    },
  },
};
