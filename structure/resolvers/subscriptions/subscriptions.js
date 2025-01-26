Copy;
const resolvers = {
  Subscription: {
    messageAdded: {
      subscribe: (_, { chatId }, { pubsub }) => {
        return pubsub.asyncIterator(`MESSAGE_ADDED_${chatId}`);
      },
    },
    postAdded: {
      subscribe: (_, { feedType, groupId }, { pubsub }) => {
        if (feedType) return pubsub.asyncIterator(`POST_ADDED_${feedType}`);
        if (groupId) return pubsub.asyncIterator(`POST_ADDED_GROUP_${groupId}`);
        return pubsub.asyncIterator("POST_ADDED_UNIVERSAL");
      },
    },
  },
};
