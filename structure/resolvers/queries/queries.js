import mutationResolvers from "../mutations/mutations.js";

// Just export the merged resolvers
const resolvers = {
  Query: {
    ...mutationResolvers.Query, // This now includes your messages query
  },
  Mutation: {
    ...mutationResolvers.Mutation, // This includes your sendMessage mutation
  },
};

export default resolvers;
