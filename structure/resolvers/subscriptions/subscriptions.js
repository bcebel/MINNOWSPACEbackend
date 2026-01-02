// 1. Make sure you are importing the SAME pubsub instance at the top

// structure/resolvers/subscriptions/subscriptions.js
// structure/resolvers/subscriptions/subscriptions.js
const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      // Use the 3rd argument 'context'
      subscribe: (_, { sessionId }, context) => {
        const { pubsub } = context; 

        if (!pubsub) {
          console.error("❌ ERROR: PubSub missing from context in resolver!");
          throw new Error("Subscription failed: PubSub not initialized");
        }

        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;
        console.log(`📡 Subscribing to: ${topic}`);
        
        return pubsub.asyncIterator([topic]);
      },
    },
  },
};

export default subscriptionResolvers;

