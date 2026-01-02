// 1. Make sure you are importing the SAME pubsub instance at the top
import { pubsub } from "../../pubsub.js";

const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      // 1. Force the return into a simple, direct iterator call
      subscribe: (_, { sessionId }) => {
        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;

        // DIAGNOSTIC LOGS - Look at these in your Heroku terminal
        console.log("🛠️ PUB-DEBUG: What is pubsub?", typeof pubsub);
        if (pubsub) {
          console.log("🛠️ PUB-DEBUG: Keys found:", Object.keys(pubsub));
          console.log(
            "🛠️ PUB-DEBUG: Prototype:",
            Object.getPrototypeOf(pubsub)?.constructor?.name
          );
        }

        try {
          return pubsub.asyncIterator(topic);
        } catch (err) {
          console.error("💥 THE CRASH:", err.message);
          throw err;
        }
      },
    },
  },
};
export default subscriptionResolvers;
