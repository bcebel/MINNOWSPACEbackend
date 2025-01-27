import express from "express";
import User from "../models/User.js"; // Adjust the path to your User model

const router = express.Router();

// Example: Get all users
router.get("/", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
