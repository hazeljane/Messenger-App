
import mongoose from "mongoose";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import { sendPushNotification } from "../../../client/src/utils/sendPushNotification.js";

// ==========================================
// CREATE PRIVATE CONVERSATION KEY
// ==========================================
function createConversationKey(userA, userB) {
  return [userA.toString(), userB.toString()]
    .sort()
    .join(":");
}

export function registerPrivateMessageHandlers(io, socket) {
  const userId = socket.user.id;

  socket.on("message:send", async (payload, callback) => {
    try {
      const {
        recipientId,
        text,
        attachment,
        replyTo,
      } = payload || {};

      // ==========================================
      // VALIDATE RECIPIENT
      // ==========================================
      if (!mongoose.isValidObjectId(recipientId)) {
        return callback?.({
          ok: false,
          message: "Invalid recipient.",
        });
      }

      if (recipientId.toString() === userId.toString()) {
        return callback?.({
          ok: false,
          message: "You cannot send a private message to yourself.",
        });
      }

      // ==========================================
      // VALIDATE MESSAGE
      // ==========================================
      const cleanText =
        typeof text === "string" ? text.trim() : "";

      const validAttachment =
        attachment &&
        typeof attachment.url === "string" &&
        attachment.url.startsWith("/uploads/") &&
        typeof attachment.originalName === "string" &&
        typeof attachment.mimeType === "string" &&
        Number.isFinite(attachment.size) &&
        attachment.size >= 0;

      if (
        (!cleanText && !validAttachment) ||
        cleanText.length > 4000
      ) {
        return callback?.({
          ok: false,
          message:
            "Send a message or attach a file. Messages must be at most 4000 characters.",
        });
      }

      // ==========================================
      // FIND SENDER
      // ==========================================
      const sender = await User.findById(userId)
        .select("_id username");

      if (!sender) {
        return callback?.({
          ok: false,
          message: "Sender not found.",
        });
      }

      // ==========================================
      // FIND RECIPIENT
      // ==========================================
      const recipient = await User.findById(recipientId)
        .select("_id username fcmTokens");

      if (!recipient) {
        return callback?.({
          ok: false,
          message: "Recipient not found.",
        });
      }

      // ==========================================
      // FIND OR CREATE CONVERSATION
      // ==========================================
      const key = createConversationKey(
        sender._id,
        recipient._id
      );

      let conversation = await Conversation.findOne({
        conversationKey: key,
      });

      if (!conversation) {
        const existingMessage = await Message.exists({
          conversationKey: key,
        });

        try {
          conversation = await Conversation.create({
            conversationKey: key,
            participants: [sender._id, recipient._id],
            requestedBy: sender._id,
            status: existingMessage ? "accepted" : "pending",
            acceptedAt: existingMessage ? new Date() : null,
          });
        } catch (error) {
          if (error.code !== 11000) {
            throw error;
          }

          conversation = await Conversation.findOne({
            conversationKey: key,
          });
        }
      }

      if (!conversation) {
        throw new Error(
          "Could not create or load conversation."
        );
      }

      // ==========================================
      // CHECK CONVERSATION PERMISSIONS
      // ==========================================

      if (conversation.status === "blocked") {
        return callback?.({
          ok: false,
          message: "You cannot send messages in this conversation.",
        });
      }

      if (conversation.status === "rejected") {
        return callback?.({
          ok: false,
          message: "This message request was rejected.",
        });
      }

      // ==========================================
      // CHECK PENDING MESSAGE REQUEST
      // ==========================================
      if (conversation.status === "pending") {
        const isRequestSender =
          String(conversation.requestedBy) ===
          String(sender._id);

        if (!isRequestSender) {
          return callback?.({
            ok: false,
            message:
              "This message request is waiting for the recipient to accept.",
          });
        }

        const existingRequestMessage = await Message.exists({
          conversationKey: key,
        });

        if (existingRequestMessage) {
          return callback?.({
            ok: false,
            message:
              "Your message request is waiting for the recipient to accept.",
          });
        }
      }

      if (
        !["pending", "accepted"].includes(conversation.status)
      ) {
        return callback?.({
          ok: false,
          message: "This conversation is not available.",
        });
      }

      // ==========================================
      // VALIDATE REPLY
      // ==========================================
      let originalMessage = null;

      if (replyTo) {
        if (!mongoose.isValidObjectId(replyTo)) {
          return callback?.({
            ok: false,
            message: "Invalid reply message.",
          });
        }

        originalMessage = await Message.findOne({
          _id: replyTo,
          conversationKey: key,
        }).select("_id");

        if (!originalMessage) {
          return callback?.({
            ok: false,
            message:
              "Original message not found in this conversation.",
          });
        }
      }

      // ==========================================
      // SAVE PRIVATE MESSAGE
      // ==========================================
      const savedMessage = await Message.create({
        conversationKey: key,
        sender: sender._id,
        recipient: recipient._id,
        replyTo: originalMessage?._id || null,
        text: cleanText,

        ...(validAttachment && {
          attachment: {
            url: attachment.url,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            size: attachment.size,
          },
        }),
      });

      // ==========================================
      // POPULATE MESSAGE
      // ==========================================
      await savedMessage.populate([
        {
          path: "sender",
          select: "_id username",
        },
        {
          path: "replyTo",
          select: "_id text sender attachment",
          populate: {
            path: "sender",
            select: "_id username",
          },
        },
      ]);

      // ==========================================
      // FORMAT MESSAGE FOR FRONTEND
      // ==========================================
      const message = {
        id: savedMessage._id.toString(),

        senderId: savedMessage.sender._id.toString(),

        senderName:
          savedMessage.sender.username || "User",

        recipientId: recipient._id.toString(),

        text: savedMessage.text,

        attachment: savedMessage.attachment?.url
          ? savedMessage.attachment
          : null,

        createdAt: savedMessage.createdAt,
        updatedAt: savedMessage.updatedAt,

        replyTo: savedMessage.replyTo
          ? {
              id: savedMessage.replyTo._id.toString(),

              senderId:
                savedMessage.replyTo.sender?._id?.toString(),

              senderName:
                savedMessage.replyTo.sender?.username || "User",

              text: savedMessage.replyTo.text,

              attachment:
                savedMessage.replyTo.attachment?.url
                  ? savedMessage.replyTo.attachment
                  : null,
            }
          : null,
      };

      // ==========================================
      // EMIT MESSAGE TO BOTH PARTICIPANTS
      // ==========================================

      // Sender receives the message on their devices.
      io.to(`user:${sender._id.toString()}`).emit(
        "message:new",
        message
      );

      // Recipient receives the message on their devices.
      io.to(`user:${recipient._id.toString()}`).emit(
        "message:new",
        message
      );

      // ==========================================
      // SEND FIREBASE PUSH NOTIFICATION
      // ==========================================

      // This runs AFTER the message is saved.
      // The sender is never included as a recipient.
      // Push delivery does not block message acknowledgment.

      const isPendingRequest =
        conversation.status === "pending";

      const notificationBody = cleanText
        ? cleanText.slice(0, 120)
        : "Sent you an attachment";

      void sendPushNotification(recipient, {
        title: isPendingRequest
          ? `New message request from ${sender.username}`
          : `New message from ${sender.username}`,

        body: notificationBody,

        data: {
          type: isPendingRequest
            ? "message_request"
            : "private_message",

          senderId: sender._id.toString(),

          conversationId: key,

          messageId: savedMessage._id.toString(),
        },
      })
        .then((result) => {
          console.log("Private push result:", {
            recipientId: recipient._id.toString(),
            ...result,
          });

          if (!result.success) {
            console.warn(
              "Private push was not delivered:",
              result.reason || "No successful device deliveries"
            );
          }
        })
        .catch((error) => {
          console.error(
            "Private push notification error:",
            error
          );
        });

      // ==========================================
      // ACKNOWLEDGE SUCCESS
      // ==========================================
      return callback?.({
        ok: true,
        message,
      });

    } catch (error) {
      console.error("Private message error:", error);

      return callback?.({
        ok: false,
        message: "Unable to send private message.",
      });
    }
  });
}
