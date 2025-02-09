import mongoose from "mongoose";

const adSchema = new mongoose.Schema({
  affiliateLink: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  clicks: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Ad", adSchema);
