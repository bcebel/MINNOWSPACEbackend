const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      // The context here MUST contain the pubsub instance from index.js
      subscribe: (_, { sessionId }, context) => {
        // Look in context first, then check if it's available globally
        // (This is a safety net for consolidated files)
        const ps = context?.pubsub;

        if (!ps || typeof ps.asyncIterator !== "function") {
          console.error(
            "❌ CRITICAL: PubSub missing in Subscription Resolver!"
          );
          throw new Error("Server configuration error: Subscriptions offline.");
        }

        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;
        console.log(`📡 [WS] Subscribing user to topic: ${topic}`);

        return ps.asyncIterator([topic]);
      },
    },
  },
};

export default subscriptionResolvers;
