// Define this at the TOP of your resolvers file (with your other imports)
const validateAffiliateLink = (link) => {
  const regex = /^(https?:\/\/)(www\.)?(impact\.com|cj\.com|rakuten\.com)\/.*$/;
  return regex.test(link);
};


Mutation: {
  addAffiliateLink: async (_, { url, title, description }, context) => {
    try {
      // Get user ID from context (authentication) instead of parameters
      if (!context.user) {
        throw new Error('Authentication required');
      }
      
      const userId = context.user.id;
      
      // Validate the affiliate link
      if (!validateAffiliateLink(url)) {
        throw new Error('Invalid affiliate link. Must be from approved networks (impact.com, cj.com, rakuten.com)');
      }
      
      const user = await User.findById(userId); // Use User, not Minnow
      if (!user) throw new Error('User not found');
      
      const newLink = {
        url,
        title: title || '',
        description: description || '',
        clicks: 0
      };
      
      user.affiliateLinks.push(newLink);
      await user.save();
      
      return user;
    } catch (error) {
      throw new Error(`Error adding affiliate link: ${error.message}`);
    }
  },
  // ... your other mutations
}