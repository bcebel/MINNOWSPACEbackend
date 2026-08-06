import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    content: String,
    imageUrl: String,
    videoUrl: String,
    fileUrl: String,
    fileName: String,
    fileType: String,
    fileSize: Number,
    ipfsUrl: String,
    mimeType: String,
    isPublic: Boolean,
    ipfsHash: String,
    thumbnailUrl: String,
    sessionId: {
      type: String,
      required: false,
      index: true,
    },
    chunkIndex: {
      type: Number,
      required: false,
      min: -1,
      default: -1,
    },
    totalChunks: {
      type: Number,
      required: false,
    },
    ipfsData: {
      cid: String,
      ipfsUrl: String,
      magnetLink: String,
      fileType: String,
      fileName: String,
    },
    magnetLink: String,
    cid: String,
    room: String,
    neighborhood: { type: mongoose.Schema.Types.ObjectId, ref: "Neighborhood" },
    createdAt: { type: Date, default: Date.now },
  },
  {
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
    toObject: { virtuals: true },
  },
);

// Compound index for instant filtering between feeds, chats, and galleries
messageSchema.index({ neighborhood: 1, room: 1, createdAt: -1 });

export default mongoose.model("Message", messageSchema);
