import mongoose from "mongoose";



const streamSchema = new mongoose.Schema(
  {
    sessionId: { type: String, unique: true, required: true, index: true }, // The unique session key
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }, // Was 'sender'
    neighborhood: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Neighborhood",
      required: true,
    },
    title: String, // Could be derived from the first chunk's "content" field
    createdAt: { type: Date, default: Date.now }, // Stream start time
    endedAt: Date, // To mark when the stream finished
    totalChunks: {
      type: Number,
      required: false, // Not required initially, but should be set eventually
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "live", "ended", "processing", "completed", "failed"],
      default: "pending",
    },
    archiveUrl: { type: String, default: null }, // The IPFS link if we "Stitch & Ship"
    isPermanentP2P: { type: Boolean, default: false }, // If true, Reassembler uses Magnet chunks instead
  },
  {
    timestamps: true,
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
