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
    mimeType: String,
    ipfsHash: String,
    ipfsData: {
      cid: String,
      ipfsUrl: String,
      magnetLink: String,
      fileType: String,
      fileName: String,
    },
    magnetLink: String,
    room: String,
    neighborhood: { type: mongoose.Schema.Types.ObjectId, ref: "Neighborhood" },
    createdAt: { type: Date, default: Date.now },
  },
  {
    // Add these options to fix ID issues
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Add virtual id field that returns _id as string
messageSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

// Ensure virtual fields are serialized
messageSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
  },
});

export default mongoose.model("Message", messageSchema);
