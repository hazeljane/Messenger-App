
import mongoose from "mongoose";
import Message from "../models/Message.js";

export function registerPrivateMessageEdit(io, socket) {
  const userId = socket.user.id;

  socket.on("message:edit", async (payload, callback) => {
    try {
      const { messageId, text } = payload || {};

      // Validate message ID.
      if (!mongoose.isValidObjectId(messageId)) {
        return callback?.({
          ok: false,
          message: "Invalid message ID.",
        });
      }

      // Validate message text.
      const cleanText =
        typeof text === "string" ? text.trim() : "";

      if (!cleanText || cleanText.length > 4000) {
        return callback?.({
          ok: false,
          message: "Message must contain 1–4000 characters.",
        });
      }

      // Find a message sent by the logged-in user.
      const message = await Message.findOne({
        _id: messageId,
        sender: userId,
      });

      if (!message || message.isDeleted) {
        return callback?.({
          ok: false,
          message: "Message not found or cannot be edited.",
        });
      }
      // Update the message.
      message.text = cleanText;
      await message.save();

      // Format the updated message for the frontend.
      const updatedMessage = {
        id: message._id.toString(),
        senderId: message.sender.toString(),
        senderName: socket.user.username || "User",
        recipientId: message.recipient.toString(),
        text: message.text,
        attachment: message.attachment?.url
          ? message.attachment
          : null,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        edited: true,
      };

      // Notify both participants.
      io.to(`user:${message.sender.toString()}`).emit(
        "message:updated",
        updatedMessage
      );

      io.to(`user:${message.recipient.toString()}`).emit(
        "message:updated",
        updatedMessage
      );

      return callback?.({
        ok: true,
        message: updatedMessage,
      });
    } catch (error) {
      console.error("Private message edit error:", error);

      return callback?.({
        ok: false,
        message: "Unable to edit private message.",
      });
    }
  });
}
