// Define this at the TOP of your resolvers file (with your other imports)
const validateAffiliateLink = (link) => {
  const regex = /^(https?:\/\/)(www\.)?(impact\.com|cj\.com|rakuten\.com)\/.*$/;
  return regex.test(link);
};

// Then in your mutations:
Mutation: {
  addAffiliateLink: async (_, { userId, url, title }) => {
    try {
      // Now just call the function that's already defined
      if (!validateAffiliateLink(url)) {
        throw new Error('Invalid affiliate link. Must be from approved networks (impact.com, cj.com, rakuten.com)');
      }
      
      const user = await Minnow.findById(userId);
      if (!user) throw new Error('User not found');
      
      const newLink = {
        url,
        title: title || '',
        description: '',
        clicks: 0
      };
      
      user.affiliateLinks.push(newLink);
      await user.save();
      
      return user;
    } catch (error) {
      throw new Error(`Error adding affiliate link: ${error.message}`);
    }
  },
  // ... your existing mutations
}