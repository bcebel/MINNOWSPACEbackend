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
    // The preferred place to define all serialization options
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        // 🔑 THE FIX: Explicitly call .toString() on _id
        ret.id = ret._id.toString();
        // Remove the MongoDB internal fields
        delete ret._id;
        delete ret.__v;
        // The result will be a plain JS object with 'id' as a string
      },
    },
    toObject: { virtuals: true },
  }
);

// 🛑 REMOVE the redundant messageSchema.set("toJSON", ...) block that was causing the conflict

// Optional: You can keep the manual virtual if you like, but it's redundant.
// If you remove the manual virtual, Mongoose still creates one based on your toJSON settings.
// For simplicity, let's remove the manual virtual and the conflicting .set block.

export default mongoose.model("Message", messageSchema);
