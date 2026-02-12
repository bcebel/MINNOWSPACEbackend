import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    youtubeVideoId: { type: String },
    thumbnail: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      default: null,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileType: { type: String, required: true },

    // --- ADDITIVE SECTION START: Slicing for Browser/Memory support ---
    isSliced: { type: Boolean, default: false },
    slices: [
      {
        index: Number,
        cid: String,
        magnetLink: String,
        size: Number,
      },
    ],
    // --- ADDITIVE SECTION END ---

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
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

videoSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("Video", videoSchema);
