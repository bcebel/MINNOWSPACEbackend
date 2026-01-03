// subscription.js
const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      subscribe: (_, { sessionId }, context) => {
        const ps = context?.pubsub;

        if (!ps || typeof ps.asyncIterator !== "function") {
          console.error(
            "❌ CRITICAL: PubSub missing in Subscription Resolver!"
          );
          throw new Error("Server configuration error: Subscriptions offline.");
        }

        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;
        console.log(`📡 [WS-SUBSCRIBE] Client subscribing to: ${topic}`);
        console.log(`📡 [WS-SUBSCRIBE] Session ID: ${sessionId}`);
        console.log(`📡 [WS-SUBSCRIBE] Time: ${new Date().toISOString()}`);

        // Log active subscriptions count (if available)
        if (ps.getSubscriptions) {
          const subs = ps.getSubscriptions();
          console.log(
            `📡 [WS-SUBSCRIBE] Total active subscriptions: ${
              Object.keys(subs).length
            }`
          );
        }

        return ps.asyncIterator([topic]);
      },
    },
  },
};

export default subscriptionResolvers;
