import express from "express";
import Message from "../models/Message.js"; // Adjust the path to your Message model
import authenticateToken from "../utils/auth.js"; // Adjust the path to your auth middleware

const router = express.Router();

// Get messages for a specific room
router.get("/:room", authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({ room: req.params.room })
      .populate("sender", "username")
      .sort("-createdAt")
      .limit(50);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
