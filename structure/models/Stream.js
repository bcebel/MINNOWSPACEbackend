import mongoose from "mongoose";

const streamSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  youtubeStreamId: { type: String, required: true },
  isLive: { type: Boolean, default: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Stream", streamSchema);
