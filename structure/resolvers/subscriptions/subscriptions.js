// structure/resolvers/subscriptions/subscriptions.js
import { pubsub } from "../../pubsub.js";

const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      subscribe: (_, { sessionId }, context) => {
        console.log("🔍 [SUBSCRIPTION-DEBUG] ============");
        console.log("🔍 [SUBSCRIPTION-DEBUG] Session ID:", sessionId);
        console.log(
          "🔍 [SUBSCRIPTION-DEBUG] Context keys:",
          Object.keys(context || {})
        );
        console.log(
          "🔍 [SUBSCRIPTION-DEBUG] Has pubsub in context?",
          !!context?.pubsub
        );
        console.log(
          "🔍 [SUBSCRIPTION-DEBUG] Imported pubsub available?",
          !!pubsub
        );
        console.log("🔍 [SUBSCRIPTION-DEBUG] ============");

        // For now, use imported pubsub to bypass context issues
        const ps = pubsub; // Use imported instance

        if (!ps || typeof ps.asyncIterator !== "function") {
          console.error("❌ CRITICAL: PubSub is not a function!");
          // Don't throw error, return dummy iterator for now
          return {
            [Symbol.asyncIterator]() {
              return {
                async next() {
                  return new Promise(() => {}); // Never resolves
                },
              };
            },
          };
        }

        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;
        console.log(`📡 [SUBSCRIPTION] Subscribing to: ${topic}`);
        return ps.asyncIterator([topic]);
      },
    },
  },
};

export default subscriptionResolvers;
