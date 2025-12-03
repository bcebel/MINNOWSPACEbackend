const mongoose = require('mongoose');
const { extractAffiliateData, migrateAffiliateLinks } = require('./utils/affiliateProcessor');

async function runMigration() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");
    
    await migrateAffiliateLinks();
    
    console.log("✅ Migration completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();