
import mongoose from "mongoose";
import Image from "./structure/models/Image.js";
import dotenv from "dotenv";
dotenv.config({ path: './config/.env' });

const migrateImages = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const result = await Image.updateMany(
      { accessLevel: { $exists: false } },
      [
        {
          $set: {
            accessLevel: {
              $cond: {
                if: { $ifNull: ["$isPublic", true] },
                then: "public",
                else: "private",
              },
            },
          },
        },
        {
          $unset: "isPublic",
        },
      ]
    );

    console.log(`Migrated ${result.modifiedCount} images.`);
  } catch (error) {
    console.error("Error migrating images:", error);
  } finally {
    await mongoose.connection.close();
  }
};

migrateImages();
