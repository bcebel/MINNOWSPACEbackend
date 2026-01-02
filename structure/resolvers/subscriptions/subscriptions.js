// 1. Make sure you are importing the SAME pubsub instance at the top
import { pubsub } from "../../pubsub.js";

// structure/resolvers/subscriptions/subscriptions.js
const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      subscribe: (_, { sessionId }, context) => {
        // Log the keys to see what actually arrived
        console.log("🎁 Context Keys:", Object.keys(context || {}));
        
        const ps = context.pubsub;

        if (!ps || typeof ps.asyncIterator !== 'function') {
          console.error("❌ PubSub still missing from context!");
          throw new Error("PubSub missing from context or broken");
        }

        return ps.asyncIterator(`LIVESTREAM_CHUNK_ADDED_${sessionId}`);
      },
    },
  },
};

export default subscriptionResolvers;
