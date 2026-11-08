
import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
  {
    // Unique identifier used by Socket.IO and Android notifications.
    callId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    callType: {
      type: String,
      enum: ["audio", "voice", "video"],
      required: true,
    },

    status: {
      type: String,
      enum: [
        "ringing",
        "accepted",
        "rejected",
        "declined",
        "missed",
        "ended",
        "cancelled",
      ],
      default: "ringing",
      index: true,
    },

    // Private WebRTC signaling data.
    offer: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      select: false,
    },

    answer: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    answeredAt: {
      type: Date,
      default: null,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    // Invitation expiration. New incoming calls use 45 seconds.
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    duration: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Find pending invitations for a recipient efficiently.
callSchema.index({
  receiver: 1,
  status: 1,
  expiresAt: 1,
});

// Find active calls belonging to either participant.
callSchema.index({
  caller: 1,
  status: 1,
});

export default mongoose.model("Call", callSchema);
