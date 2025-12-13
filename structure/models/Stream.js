import mongoose from "mongoose";

const streamSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    youtubeStreamId: { type: String, required: true },
    isLive: { type: Boolean, default: false },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
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

export default mongoose.model("Stream", streamSchema);
