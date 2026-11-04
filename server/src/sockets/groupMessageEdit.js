
import mongoose from "mongoose";
import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";

export function registerGroupMessageEdit(io, socket) {
  const userId = socket.user.id;

  socket.on("group:message:edit", async (payload, callback) => {
    try {
      const { messageId, text } = payload || {};

      // 1. Validate message ID.
      if (!mongoose.isValidObjectId(messageId)) {
        return callback?.({
          ok: false,
          message: "Invalid message ID.",
        });
      }

      // 2. Validate message text.
      const cleanText =
        typeof text === "string" ? text.trim() : "";

      if (cleanText.length > 4000) {
        return callback?.({
          ok: false,
          message: "Message cannot exceed 4000 characters.",
        });
      }

const message = await GroupMessage.findById(messageId);

console.log("===== MESSAGE EDIT CHECK =====");
console.log("Message ID:", messageId);
console.log("Authenticated user:", userId);
console.log("Message exists:", Boolean(message));

if (message) {
  console.log("Message sender:", message.sender?.toString());
  console.log("Sender matches:",
    message.sender?.toString() === userId.toString()
  );
  console.log("Is deleted:", message.isDeleted);
}

console.log("==============================");

if (
  !message ||
  message.isDeleted ||
  message.sender?.toString() !== userId.toString()
) {
  return callback?.({
    ok: false,
    message: "Message not found or cannot be edited.",
  });
}

      // 4. Confirm the user is still a group member.
      const group = await Group.findOne({
        _id: message.group,
        members: userId,
      }).select("_id members");

      if (!group) {
        return callback?.({
          ok: false,
          message: "Group not found or you are not a member.",
        });
      }

      // 5. Ensure the message still has content.
      const hasAttachment = Boolean(message.attachment?.url);

      if (!cleanText && !hasAttachment) {
        return callback?.({
          ok: false,
          message: "Message must contain text or an attachment.",
        });
      }

      // 6. Update message text.
      message.text = cleanText;
      await message.save();

      // 7. Format updated message.
      const updatedMessage = {
        id: message._id.toString(),
        groupId: group._id.toString(),
        senderId: message.sender.toString(),
        senderName: socket.user.username || "User",
        text: message.text,
        attachment: message.attachment?.url
          ? message.attachment
          : null,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        edited: true,
      };

      // 8. Broadcast updated message to all group members.
      for (const memberId of group.members) {
        io.to(`user:${memberId.toString()}`).emit(
          "group:message:edited",
          updatedMessage
        );
      }

      // 9. Return success.
      return callback?.({
        ok: true,
        message: updatedMessage,
      });
    } catch (error) {
      console.error("Group message edit error:", error);

      return callback?.({
        ok: false,
        message: "Unable to edit group message.",
      });
    }
  });
}
