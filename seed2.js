import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Models from "./structure/models/index.js";
// Load environment variables


// MongoDB connection
const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error("MONGODB_URI is not defined in the environment variables.");
  process.exit(1);
}

mongoose.connect(URI);

// User Schema

const User = Models.User;

// Message Schema

const Message = Models.Message;

async function seedDatabase() {
  try {
    // Clear existing data
    await User.deleteMany({});
    await Message.deleteMany({});
    console.log("All existing records have been removed.");

    // Create sample users with hashed passwords
    const hashedPassword1 = await bcrypt.hash("password123", 10);
    const hashedPassword2 = await bcrypt.hash("testpass456", 10);

    const users = [
      {
        username: "testuser1",
        password: hashedPassword1,
        email: "email@liame.com",
      },
      {
        username: "testuser2",
        password: hashedPassword2,
        email: "liame@email.com",
      },
    ];

    const createdUsers = await User.insertMany(users);
    console.log("Users seeded successfully!");

    // Create sample messages
    const messages = [
      {
        sender: createdUsers[0]._id, // Sender is testuser1
        content: "Hello, this is a test message!",
        room: "general",
      },
      {
        sender: createdUsers[1]._id, // Sender is testuser2
        content: "Hi there! This is another test message.",
        room: "general",
      },
    ];

    await Message.insertMany(messages);
    console.log("Messages seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    mongoose.connection.close();
  }
}

seedDatabase();
