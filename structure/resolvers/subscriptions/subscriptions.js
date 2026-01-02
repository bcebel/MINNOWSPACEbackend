import { withFilter } from "graphql-subscriptions";
import { pubsub } from "../../pubsub.js"; // <--- This is the one we want!

const resolvers = {
  Subscription: {
    messageAdded: {
      // Remove { pubsub } from the 3rd argument
      subscribe: (_, { chatId }) => {
        return pubsub.asyncIterator(`MESSAGE_ADDED_${chatId}`);
      },
    },
    postAdded: {
      // Remove { pubsub } from the 3rd argument
      subscribe: (_, { feedType, groupId }) => {
        if (feedType) return pubsub.asyncIterator(`POST_ADDED_${feedType}`);
        if (groupId) return pubsub.asyncIterator(`POST_ADDED_GROUP_${groupId}`);
        return pubsub.asyncIterator("POST_ADDED_UNIVERSAL");
      },
    },
    livestreamChunkAdded: {
      // Remove { pubsub } from the 3rd argument
      subscribe: (_, { sessionId }) => {
        // Now 'pubsub' refers to your import at the top
        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;
        console.log(`📡 [SUBSCRIPTION] User started listening to: ${topic}`);

        return pubsub.asyncIterator(topic);
      },
    },
  },
};

export default resolvers;
