import mongoose from "mongoose";

const streamChunkSchema = new mongoose.Schema(
  {
    stream: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stream",
      required: true,
      index: true,
    }, // Parent reference
    chunkIndex: { type: Number, required: true, min: -1 }, // Essential for correct order
    magnetLink: { type: String, required: true }, // Essential for WebTorrent
    fileName: { type: String, required: true }, // e.g., 'chunk_21.mp4'
    mimeType: String,
    fileSize: Number, // In bytes (good to have for progress)
    // Optional: You could store a 'duration' field if your recorder provides it.
  },
  {
    timestamps: true, // The preferred place to define all serialization options

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

export default mongoose.model("StreamChunk", streamChunkSchema);
