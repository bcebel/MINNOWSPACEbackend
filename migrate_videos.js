
import mongoose from "mongoose";
import Video from "./structure/models/Video.js";
import dotenv from "dotenv";
dotenv.config({ path: './config/.env' });

const migrateVideos = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const result = await Video.updateMany(
      { accessLevel: { $exists: false } },
      { $set: { accessLevel: "public" } }
    );

    console.log(`Migrated ${result.nModified} videos.`);
  } catch (error) {
    console.error("Error migrating videos:", error);
  } finally {
    await mongoose.connection.close();
  }
};

migrateVideos();
