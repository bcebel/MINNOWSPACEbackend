// structure/models/Image.js
import mongoose from "mongoose";

const imageSchema = new mongoose.Schema({
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  neighborhood: { type: mongoose.Schema.Types.ObjectId, ref: "Neighborhood" },
  fileName: String,
  fileSize: Number,
  fileType: String,
  mimetype: String,
  cid: String,
  ipfsUrl: String,
  magnetLink: String,
  isPublic: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  isPublic: {
    type: Boolean,
    default: false
  },
  strategy: {
    type: String,
    enum: ["sequential", "rarest"],
    default: "rarest", // Images default to rarest
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Video",
    default: null,
  },
  isThumbnail: {
    type: Boolean,
    default: false,
  },
  originalVideoFileName: String,
});

export default mongoose.model("Image", imageSchema);
