// 1. Make sure you are importing the SAME pubsub instance at the top
import { pubsub } from "../../pubsub.js";

const resolvers = {
  Subscription: {
    livestreamChunkAdded: {
      // 2. REMOVE { pubsub } from the third argument (context)
      // This forces the resolver to use the 'pubsub' we imported above
      subscribe: (_, { sessionId }) => {
        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;
        console.log(`📡 [SUBSCRIPTION] Listening to: ${topic}`);

        // 3. Now this will definitely work because it's using the imported instance
        return pubsub.asyncIterator(topic);
      },
    },
  },
};
export default resolvers;
