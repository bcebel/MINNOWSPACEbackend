import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
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
  room: String,
  neighborhood: { type: mongoose.Schema.Types.ObjectId, ref: "Neighborhood" }, // NEW
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Message", messageSchema);
