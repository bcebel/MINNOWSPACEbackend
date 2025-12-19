import { withFilter } from 'graphql-subscriptions';

const resolvers = {
  Subscription: {
    messageAdded: {
      subscribe: (_, { chatId }, { pubsub }) => {
        return pubsub.asyncIterator(`MESSAGE_ADDED_${chatId}`);
      },
    },
    postAdded: {
      subscribe: (_, { feedType, groupId }, { pubsub }) => {
        if (feedType) return pubsub.asyncIterator(`POST_ADDED_${feedType}`);
        if (groupId) return pubsub.asyncIterator(`POST_ADDED_GROUP_${groupId}`);
        return pubsub.asyncIterator("POST_ADDED_UNIVERSAL");
      },
    },
    livestreamChunkAdded: {
      subscribe: withFilter(
        // This is the subscribe function - it tells the server what events to listen for.
        (parent, args, context) => {
          // Use the `pubsub` from your context
          const { pubsub } = context; 
          if (!pubsub) {
            throw new Error("PubSub instance not available in context.");
          }
          // The channel name should include the sessionId for filtering.
          // Note: args.sessionId is coming from the client's subscription variables.
          return pubsub.asyncIterator(`LIVESTREAM_CHUNK_ADDED_${args.sessionId}`);
        },
        // This is the filter function - it determines if a specific event should be sent to the subscriber.
        (payload, variables) => {
          // `payload` is the data published by `pubsub.publish` (e.g., { livestreamChunkAdded: { sessionId: "...", ... } })
          // `variables` are the arguments the client sent with the subscription (e.g., { sessionId: "..." })
          
          // Only send the chunk to subscribers who asked for this specific sessionId.
          return payload.livestreamChunkAdded.sessionId === variables.sessionId;
        }
      ),
    },
  },
};

export default resolvers;
