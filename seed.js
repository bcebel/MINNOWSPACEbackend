require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// MongoDB connection
const URI = process.env.MONGODB_URI;
mongoose.connect(URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);

async function seedDatabase() {
  try {
    const hashedPassword1 = await bcrypt.hash("password123", 10);
    const hashedPassword2 = await bcrypt.hash("testpass456", 10);

    const users = [
      { username: "testuser1", password: hashedPassword1 },
      { username: "testuser2", password: hashedPassword2 },
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
