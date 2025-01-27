import { Schema, model } from "mongoose";
import bcrypt from "bcrypt";

const minnowSchema = new Schema(
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
    password: {
      type: String,
      required: true,
      minlength: 5,
    },
    affiliateLink: {
      type: String,
      trim: true,

    },
    youtubeChannel: {
      type: String,
      trim: true,
    },
    videos: [
      {
        type: Schema.Types.ObjectId,
        ref: "Video",
      },
    ],
    streams: [
      {
        type: Schema.Types.ObjectId,
        ref: "Stream",
      },
    ],
    balance: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt
  }
);

// Pre-save middleware to hash the password
minnowSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("password")) {
    const saltRounds = 10;
    this.password = await bcrypt.hash(this.password, saltRounds);
  }

  // Update the updatedAt field
  if (this.isModified()) {
    this.updatedAt = Date.now();
  }

  next();
});

// Method to compare incoming password with the hashed password
minnowSchema.methods.isCorrectPassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

const Minnow = model("Minnow", minnowSchema);

export default Minnow;
