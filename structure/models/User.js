import { Schema, model } from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      match: [/.+@.+\..+/, "Must match an email address!"],
    },
    bio: {
      type: String,
      default: "",
      maxlength: 500,
    },
    password: {
      type: String,
      required: true,
      minlength: 5,
    },
    profilePhoto: {
      type: String,
      default: function () {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(
          this.username
        )}&background=00FF00&color=000`;
      },
    },
    affiliateLinks: [
      {
        url: String,
        title: String,
        description: String,
        clicks: { type: Number, default: 0 },
      },
    ],
    // ... keep the rest of your schema
  },
  { timestamps: true }
);

// Pre-save middleware to hash password
userSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("password")) {
    const saltRounds = 10;
    this.password = await bcrypt.hash(this.password, saltRounds);
  }
  next();
});

// Password comparison method
userSchema.methods.isCorrectPassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

const User = model("User", userSchema);
export default User;
