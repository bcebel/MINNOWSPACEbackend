
import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  affiliateLink: { type: String },
  youtubeChannel: { type: String },
  videos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Video" }],
  streams: [{ type: mongoose.Schema.Types.ObjectId, ref: "Stream" }],
  chats: [{ type: mongoose.Schema.Types.ObjectId, ref: "Chat" }],
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", userSchema);
