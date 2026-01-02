const subscriptionResolvers = {
  Subscription: {
    livestreamChunkAdded: {
      // Use the 'context' argument (the 3rd one)
      subscribe: (_, { sessionId }, context) => {
        // Pull pubsub from the context we injected in index.js
        const { pubsub } = context;

        if (!pubsub || typeof pubsub.asyncIterator !== "function") {
          console.error("❌ RESOLVER ERROR: PubSub missing from context!");
          throw new Error("pubsub.asyncIterator is not a function");
        }

        const topic = `LIVESTREAM_CHUNK_ADDED_${sessionId}`;
        console.log(`📡 [SUBSCRIPTION] Listening for topic: ${topic}`);

        return pubsub.asyncIterator(topic);
      },
    },
  },
};

export default subscriptionResolvers;
