import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }],
    feedType: {
      type: String,
      enum: ["universal", "group", "individual"],
      required: true,
    },
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" }, // Optional
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
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
export default mongoose.model("Post", postSchema);
