import mongoose from "mongoose";
import crypto from "crypto";

const NeighborhoodSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["personal", "private", "public", "global"],
      default: "private",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        role: {
          type: String,
          enum: ["owner", "moderator", "member"],
          default: "member",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    joinRequests: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        requestedAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
      },
    ],
    rules: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    inviteLinks: [
      {
        code: {
          type: String,
          required: true,
          unique: true,
        },
        name: {
          type: String,
          default: "Invite Link",
        },
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        maxUses: {
          type: Number,
          default: 0, // 0 = unlimited
        },
        uses: {
          type: Number,
          default: 0,
        },
        expiresAt: {
          type: Date,
          default: null, // null = never expires
        },
        role: {
          type: String,
          enum: ["member", "moderator"],
          default: "member",
        },
        isActive: {
          type: Boolean,
          default: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
       rules: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Invite settings
    allowMemberInvites: {
      type: Boolean,
      default: true,
    },
    maxMembers: {
      type: Number,
      default: 100,
    },
  },
  {
    timestamps: true, // This adds createdAt and updatedAt automatically
  }
);

// Generate a unique invite code
NeighborhoodSchema.statics.generateInviteCode = function() {
  return crypto.randomBytes(8).toString('hex').toUpperCase();
};

// Check if invite link is valid
NeighborhoodSchema.methods.isValidInviteLink = function(code) {
  const link = this.inviteLinks.find(link => link.code === code);
  
  if (!link || !link.isActive) return false;
  
  if (link.maxUses > 0 && link.uses >= link.maxUses) return false;
  
  if (link.expiresAt && link.expiresAt < new Date()) return false;
  
  return true;
};

// Helper method to create a new invite link
NeighborhoodSchema.methods.createInviteLink = async function(options) {
  const {
    createdBy,
    name = "Invite Link",
    maxUses = 0,
    expiresAt = null,
    role = "member",
  } = options;
  
  const code = Neighborhood.generateInviteCode();
  
  this.inviteLinks.push({
    code,
    name,
    createdBy,
    maxUses,
    expiresAt,
    role,
  });
  
  await this.save();
  
  return this.inviteLinks[this.inviteLinks.length - 1];
};

// Add index for better performance
NeighborhoodSchema.index({ owner: 1 });
NeighborhoodSchema.index({ "members.user": 1 });
NeighborhoodSchema.index({ type: 1 });
NeighborhoodSchema.index({ "inviteLinks.code": 1 });

export default mongoose.model("Neighborhood", NeighborhoodSchema);
