import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // Title of the video
    description: { type: String }, // Optional description
    youtubeVideoId: { type: String }, // Optional YouTube video ID (if applicable)
    thumbnail: { type: String }, // Thumbnail URL (optional)
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // User who uploaded the video
    fileName: { type: String, required: true }, // Original name of the uploaded file
    fileSize: { type: Number, required: true }, // Size of the file in bytes
    fileType: { type: String, required: true }, // MIME type of the file (e.g., "video/mp4")
    cid: { type: String, required: true }, // IPFS Content Identifier (CID)
    ipfsUrl: { type: String, required: true }, // IPFS gateway URL
    magnetLink: { type: String, required: true }, // Magnet link for torrent
    accessLevel: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
    neighborhood: { type: mongoose.Schema.Types.ObjectId, ref: "Neighborhood" },
    thumbnailUrl: String,
    createdAt: { type: Date, default: Date.now }, // Timestamp of upload
    updatedAt: { type: Date, default: Date.now }, // Timestamp of last update
    strategy: {
      type: String,
      enum: ["sequential", "rarest"],
      default: "sequential", // Default for videos
    },
    videoMetadata: {
      duration: Number,
      bitrate: Number,
      codec: String,
      resolution: String,
      hasFastStart: Boolean, // For MP4 moov atom position
    },
    thumbnail: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      default: null,
    },
    thumbnailUrl: String,
  },
  { timestamps: true }
);
// Middleware to update `updatedAt` on save
videoSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("Video", videoSchema);
