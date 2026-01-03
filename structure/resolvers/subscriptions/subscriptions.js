// structure/resolvers/subscriptions/subscriptions.js
import { pubsub } from "../../pubsub.js";

console.log("🚀 Subscription resolver loaded at startup!");

const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      subscribe: (_, { sessionId }) => {
        console.log(
          `🎯 [SUBSCRIPTION-CALLED] Client subscribing to: ${sessionId}`
        );

        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;
        console.log(`📡 [SUBSCRIPTION-TOPIC] Using channel: ${topic}`);

        // Create the async iterator
        const iterator = pubsub.asyncIterator([topic]);

        // Wrap it to log when data comes through
        const originalNext = iterator.next.bind(iterator);
        iterator.next = async () => {
          const result = await originalNext();
          if (result.value) {
            console.log(
              `📨 [SUBSCRIPTION-DATA] Delivering chunk ${result.value.livestreamChunkAdded?.chunkIndex} to client`
            );
          }
          return result;
        };

        return iterator;
      },
    },
  },
};

export default subscriptionResolvers;
