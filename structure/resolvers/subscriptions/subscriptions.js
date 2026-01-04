// structure/resolvers/subscriptions/subscriptions.js
import { pubsub } from "../../pubsub.js";

console.log("✅ Subscription resolver loaded");

const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      subscribe: (_, { sessionId }) => {
        console.log(`📡 [SERVER] Client subscribing to session: ${sessionId}`);

        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;

        // Simple, no wrapper, just return the iterator
        return pubsub.asyncIterator([topic]);
      },
    },
  },
};

export default subscriptionResolvers;
