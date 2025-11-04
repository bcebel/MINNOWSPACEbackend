
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import bcrypt from "bcrypt";


 
// MongoDB connection
const URI = process.env.MONGODB_URI;
mongoose.connect(URI);

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);

// Message Schema and Model
const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  content: String,
  imageUrl: String,
  room: String,
  createdAt: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", MessageSchema);

async function seedDatabase() {
  try {
    await User.deleteMany({});
    await Message.deleteMany({});
    
    console.log("All existing records have been removed.");
    
    const Password1 ="password123"
    const Password2 = "testpass456";

    const users = [
      { username: "testuser1", password: Password1, email: "email@liame.com" },
      { username: "testuser2", password: Password2, email: "liame@email.com"},
    ];


        

    await User.insertMany(users);

    console.log("Database seeded successfully!");
    mongoose.connection.close();
  } catch (error) {
    console.error("Error seeding database:", error);
    mongoose.connection.close();
  }
}

seedDatabase();
