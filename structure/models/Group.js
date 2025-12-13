import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    members: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    // CRITICAL OPTIONS FOR GRAPHQL
    toJSON: {
      virtuals: true, // IMPORTANT: Creates 'id' field from '_id'
      // Optional: A custom transform function to clean up fields like __v and _id
      transform: (doc, ret) => {
        ret.id = ret._id.toString(); // Ensure ID is a string
        delete ret._id;
        delete ret.__v;
      },
    },
    toObject: {
      virtuals: true, // IMPORTANT: Also applies when converting to plain objects
    },
  }
);
export default mongoose.model("Group", groupSchema);
