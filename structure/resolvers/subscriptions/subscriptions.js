import { withFilter } from 'graphql-subscriptions';
import { pubsub } from "../../pubsub.js";

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
    livestreamChunkAdded: {
      subscribe: (_, { sessionId }, { pubsub }) => {
        // 1. Validation check
        if (!pubsub) throw new Error("PubSub instance missing in context");

        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;
        console.log(`📡 [SUBSCRIPTION] User started listening to: ${topic}`);

        return pubsub.asyncIterator(topic);
      },
    },
  },
};

export default resolvers;
