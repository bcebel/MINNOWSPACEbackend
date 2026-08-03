import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
      trim: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 1. Swarmable P2P Media Support
    media: [
      {
        url: { type: String }, // Standard direct URL or CDN fallback
        cid: { type: String }, // IPFS / WebTorrent CID for P2P distribution
        magnetURI: { type: String }, // WebTorrent Magnet Link
        mediaType: {
          type: String,
          enum: ["image", "video", "audio", "file"],
          default: "image",
        },
      },
    ],

    // 2. Affiliate & Ad Integration (Parsed on creation for zero React chaos)
    affiliate: {
      targetUrl: { type: String }, // Destination URL with affiliate tracking ID
      bannerUrl: { type: String }, // Extracted product / banner image URL
      title: { type: String }, // Product or campaign title
      network: { type: String }, // e.g., "CJ", "Impact", "Awin", "Amazon", "Custom"
      rawHtml: { type: String }, // Optional raw snippet fallback if needed
      isSponsored: { type: Boolean, default: false },
    },

    feedType: {
      type: String,
      enum: ["universal", "neighborhood", "group", "individual"],
      default: "universal",
      required: true,
    },

    neighborhood: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Neighborhood",
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
    },

    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    comments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment",
      },
    ],

    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Auto-manages createdAt & updatedAt
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

export default mongoose.model("Post", postSchema);
