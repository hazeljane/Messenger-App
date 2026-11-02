
import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    conversationKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      ],
      required: true,
      validate: {
        validator: (participants) =>
          participants.length === 2,
        message:
          "A conversation must have exactly two participants.",
      },
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "blocked"],
      default: "pending",
    },

    acceptedAt: {
      type: Date,
      default: null,
    },

    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    blockedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Conversation", conversationSchema);
