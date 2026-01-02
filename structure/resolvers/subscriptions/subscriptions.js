// 1. Make sure you are importing the SAME pubsub instance at the top
import { pubsub } from "../../pubsub.js";

const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      // 1. Force the return into a simple, direct iterator call
      subscribe: (parent, { sessionId }) => {
        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;

        // 2. Log exactly what the topic is to verify the frontend
        // and backend are on the same ID
        console.log("👂 Subscription triggered for topic:", topic);

        return pubsub.asyncIterator([topic]); // Wrap topic in an array
      },
    },
  },
};
export default subscriptionResolvers;
