// backend/fixImageNeighborhoods.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Message from "./structure/models/Message.js";
import Video from "./structure/models/Video.js";
import Image from "./structure/models/Image.js";

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Check if file is an image based on mimetype or extension
const isImageFile = (fileName, mimetype, fileType) => {
  if (mimetype && mimetype.startsWith("image/")) return true;
  if (fileType && fileType === "image") return true;
  if (fileName) {
    const ext = fileName.toLowerCase().split(".").pop();
    return ["jpg", "jpeg", "png", "gif", "webp", "heic", "bmp"].includes(ext);
  }
  return false;
};

const fixImageNeighborhoods = async () => {
  console.log(
    "🖼️ Fixing neighborhood associations for images in Video collection..."
  );

  // Find ALL images in the Video collection
  const allVideos = await Video.find({}).lean();
  console.log(`📊 Found ${allVideos.length} total records in Video collection`);

  // Filter to find images
  const imagesInVideoCollection = allVideos.filter((video) =>
    isImageFile(video.fileName, video.mimetype, video.fileType)
  );

  console.log(
    `🖼️ Found ${imagesInVideoCollection.length} images in Video collection`
  );

  let imagesFixed = 0;
  let alreadyFixed = 0;
  let movedToImageCollection = 0;
  let errors = 0;

  for (const img of imagesInVideoCollection) {
    try {
      console.log(`\n🔍 Processing: ${img.fileName || img.title}`);

      // Try to find a matching message
      let matchingMessage = null;

      // Method 1: Search by magnet link
      if (img.magnetLink) {
        matchingMessage = await Message.findOne({
          magnetLink: {
            $regex: img.magnetLink.substring(0, 40),
            $options: "i",
          },
        });
      }

      // Method 2: Search by CID
      if (!matchingMessage && img.cid) {
        matchingMessage = await Message.findOne({
          $or: [
            { videoUrl: { $regex: img.cid, $options: "i" } },
            { imageUrl: { $regex: img.cid, $options: "i" } },
          ],
        });
      }

      // Method 3: Search by IPFS URL
      if (!matchingMessage && img.ipfsUrl) {
        const cid = img.ipfsUrl.split("/ipfs/")[1];
        if (cid) {
          matchingMessage = await Message.findOne({
            $or: [
              { videoUrl: { $regex: cid, $options: "i" } },
              { imageUrl: { $regex: cid, $options: "i" } },
            ],
          });
        }
      }

      // Method 4: Search by filename
      if (!matchingMessage && img.fileName) {
        const sanitizedFileName = img.fileName
          .replace(/[^\x00-\x7F]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 30);

        matchingMessage = await Message.findOne({
          fileName: { $regex: sanitizedFileName, $options: "i" },
        });
      }

      if (matchingMessage && matchingMessage.neighborhood) {
        // Check if already has neighborhood
        if (
          !img.neighborhood ||
          img.neighborhood.toString() !==
            matchingMessage.neighborhood.toString()
        ) {
          // Update the Video record with neighborhood
          await Video.updateOne(
            { _id: img._id },
            { $set: { neighborhood: matchingMessage.neighborhood } }
          );
          imagesFixed++;
          console.log(
            `✅ Fixed: Added neighborhood ${matchingMessage.neighborhood} to image`
          );
        } else {
          alreadyFixed++;
          console.log(`ℹ️ Already has neighborhood: ${img.neighborhood}`);
        }

        // OPTIONAL: Move to Image collection (if you want separate collections)
        const shouldMoveToImageCollection = true; // Set to true if you want to move them

        if (shouldMoveToImageCollection) {
          // Create new Image document
          const newImage = new Image({
            title: img.title,
            description: img.description || "",
            user: img.user,
            fileName: img.fileName,
            fileSize: img.fileSize,
            fileType: "image",
            mimetype: img.mimetype || "image/jpeg",
            cid: img.cid,
            ipfsUrl: img.ipfsUrl,
            magnetLink: img.magnetLink,
            strategy: "rarest",
            neighborhood: matchingMessage.neighborhood,
            createdAt: img.createdAt,
          });

          await newImage.save();

          // Delete from Video collection (optional)
          await Video.deleteOne({ _id: img._id });

          movedToImageCollection++;
          console.log(`🔄 Moved to Image collection`);
        }
      } else {
        console.log(`❓ No matching message found for this image`);
      }
    } catch (error) {
      errors++;
      console.error(`💥 Error:`, error.message);
    }
  }

  console.log("\n📊 FINAL RESULTS for Images in Video Collection:");
  console.log(`✅ Images fixed with neighborhoods: ${imagesFixed}`);
  console.log(`ℹ️ Already had neighborhoods: ${alreadyFixed}`);
  console.log(`🔄 Moved to Image collection: ${movedToImageCollection}`);
  console.log(`❌ Errors: ${errors}`);

  // Also show summary of what's in each collection now
  const videoCount = await Video.countDocuments();
  const imageCount = await Image.countDocuments();
  const videosWithNeighborhood = await Video.countDocuments({
    neighborhood: { $exists: true },
  });
  const imagesWithNeighborhood = await Image.countDocuments({
    neighborhood: { $exists: true },
  });

  console.log("\n📦 COLLECTION SUMMARY:");
  console.log(
    `📹 Video collection: ${videoCount} total, ${videosWithNeighborhood} with neighborhoods`
  );
  console.log(
    `🖼️ Image collection: ${imageCount} total, ${imagesWithNeighborhood} with neighborhoods`
  );
};

// Run the script
const run = async () => {
  try {
    await connectDB();
    await fixImageNeighborhoods();
    console.log("\n🎉 Script completed!");
    process.exit(0);
  } catch (error) {
    console.error("💥 Script failed:", error);
    process.exit(1);
  }
};

run();
