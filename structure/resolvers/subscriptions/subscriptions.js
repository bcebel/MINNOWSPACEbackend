// 1. Make sure you are importing the SAME pubsub instance at the top
import { pubsub } from "../../pubsub.js";

const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      // 1. Force the return into a simple, direct iterator call
      subscribe: (_, { sessionId }, context) => {
        // We pull pubsub from the context that index.js is sending
        const { pubsub } = context;

        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;

        // This log will tell us if context actually has the real pubsub
        console.log("🔍 Context PubSub Check:", !!pubsub?.asyncIterator);

        if (!pubsub || typeof pubsub.asyncIterator !== "function") {
          throw new Error("PubSub missing from context or broken");
        }

        return pubsub.asyncIterator(topic);
      },
    },
  },
};
export default subscriptionResolvers;
