import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 30,
    },

    usernameLower: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
      maxlength: 254,
    },
    
    // Firebase Cloud Messaging device tokens
    fcmTokens: [
      {
        _id: false,
        token: {
          type: String,
          required: true,
        },
        platform: {
          type: String,
          enum: ["android", "ios", "web"],
          default: "android",
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    role: {
      type: String,
      enum: ["admin", "member"],
      default: "member",
    },
    
    theme: {
      type: String,
      enum: ["light", "dark"],
      default: "light",
    },
// Actual presence status
activeStatus: {
  type: String,
  enum: ["online", "offline", "away"],
  default: "offline",
},

// Whether other users can see your active status
showActiveStatus: {
  type: Boolean,
  default: true,
},

// Last time the user went offline
lastSeen: {
  type: Date,
  default: null,
},

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.usernameLower;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("User", userSchema);