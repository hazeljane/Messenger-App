import { Router } from "express";
import mongoose from "mongoose";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

export function conversationKey(userA, userB) {
  return [String(userA), String(userB)].sort().join(":");
}
router.get("/:userId", requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) 
      return res.status(400).json({ 
      message: "Invalid user ID." 
    });
  
    if (String(req.user._id) === userId) 
      return res.status(400).json({
      message: "You cannot start a conversation with yourself." 
    });
    const otherUser = await User.findById(userId).select("_id");
    if (!otherUser)
      return res.status(404).json({ 
      message: "User not found."
    });

    const key = conversationKey(req.user._id, otherUser._id);
    const conversation = await Conversation.findOne({
  conversationKey: key,
});

// Do not allow access to a rejected conversation.
if (conversation?.status === "rejected") {
  return res.status(403).json({
    message: "This message request was rejected.",
  });
}
if (conversation?.status === "blocked") {
  return res.status(403).json({
    message: "You cannot send messages in this conversation.",
  });
}
    const messages = await Message.find({ 
      conversationKey: key, 
      deletedFor: { $ne: req.user._id }, 
    })
      .sort({ createdAt: 1 })
      .limit(500)
      .populate("sender", "_id username")
      .populate({
        path: "replyTo",
        select: "_id text sender attachment isDeleted",
        populate: {
        path: "sender",
        select: "_id username",
      },
    })
    .lean();

    res.json({
      messages: messages.map((message) => ({
        id: message._id.toString(),

        senderId: message.sender?._id?.toString(),
        senderName: message.sender?.username || "User",

        recipientId: message.recipient.toString(),

        text: message.text || "",
        attachment: message.attachment?.url 
          ? message.attachment 
          : null,

        createdAt: message.createdAt,
        updatedAt: message.updatedAt,

        edited: Boolean(
  message.updatedAt &&
  message.createdAt &&
  message.updatedAt.getTime() !== message.createdAt.getTime()
),

        isDeleted: Boolean(message.isDeleted),
        deletedBy: message.deletedBy ? String(message.deletedBy) : null,
        deletedAt: message.deletedAt || null,

  replyTo: message.replyTo
    ? {
        id: message.replyTo._id.toString(),
        senderId: message.replyTo.sender?._id?.toString(),
        senderName: message.replyTo.sender?.username || "User",
        text: message.replyTo.text || "",
        attachment: message.replyTo.isDeleted ? null
        : message.replyTo.attachment?.url 
          ? message.replyTo.attachment : null,
        
          isDeleted: Boolean(message.replyTo.isDeleted),
      }
    : null,
})),
    });
  } catch (error) {
    console.error("Load messages error:", error);

    return res.status(500).json({
      message: "Could not load messages.",
    });
  }
});

export default router;