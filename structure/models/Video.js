import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    youtubeVideoId: { type: String },
    // NOTE: You have 'thumbnail' defined twice. I'm keeping the ref: "Image" one.
    // Ensure you only have one definition in your actual code.
    thumbnail: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      default: null,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileType: { type: String, required: true },
    cid: { type: String, required: true },
    ipfsUrl: { type: String, required: true },
    magnetLink: { type: String, required: true },
    neighborhood: { type: mongoose.Schema.Types.ObjectId, ref: "Neighborhood" },
    thumbnailUrl: String,
    strategy: {
      type: String,
      enum: ["sequential", "rarest"],
      default: "sequential",
    },
    videoMetadata: {
      duration: Number,
      bitrate: Number,
      codec: String,
      resolution: String,
      hasFastStart: Boolean,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    // 🔑 CRITICAL FIX: Add serialization options for GraphQL compatibility
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        // Ensure the root ID is a string
        ret.id = ret._id.toString();
        // Clean up internal fields
        delete ret._id;
        delete ret.__v;
        return ret; // Return the cleaned object
      },
    },
    toObject: { virtuals: true },
  }
);

// Middleware to update `updatedAt` on save (This is correct)
videoSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("Video", videoSchema);
