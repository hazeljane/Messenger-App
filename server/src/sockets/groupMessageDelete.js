import mongoose from "mongoose";
import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";

export function registerGroupMessageDelete(io, socket) {
  const userId = socket.user.id;

  socket.on("group:message:delete", async (payload, callback) => {
    try {
      const { messageId, deleteType } = payload || {};

      // =====================================
      // 1. VALIDATE REQUEST
      // =====================================

      console.log("\n===== GROUP MESSAGE DELETE CHECK =====");
      console.log("Message ID:", messageId);
      console.log("Delete type:", deleteType);
      console.log("Authenticated user:", userId);

      if (!mongoose.isValidObjectId(messageId)) {
        return callback?.({
          ok: false,
          message: "Invalid message ID.",
        });
      }

      if (
        !["deleteForYou", "deleteForEveryone"].includes(deleteType)
      ) {
        return callback?.({
          ok: false,
          message: "Invalid delete option.",
        });
      }

      // =====================================
      // 2. FIND MESSAGE
      // =====================================

      const message = await GroupMessage.findById(messageId);

      if (!message) {
        return callback?.({
          ok: false,
          message: "Group message not found.",
        });
      }

      console.log("Message exists:", true);
      console.log("Message sender:", message.sender);
      console.log("Current isDeleted:", message.isDeleted);

      // =====================================
      // 3. VERIFY GROUP MEMBERSHIP
      // =====================================

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

      // =====================================
      // 4. DELETE FOR CURRENT USER ONLY
      // =====================================

      if (deleteType === "deleteForYou") {
        await GroupMessage.updateOne(
          {
            _id: message._id,
            group: group._id,
          },
          {
            $addToSet: {
              deletedFor: userId,
            },
          }
        );

        const update = {
          id: message._id.toString(),
          groupId: group._id.toString(),
          deletedFor: String(userId),
          deleteType: "deleteForYou",
        };

        // Notify only the current user's devices.
        io.to(`user:${userId}`).emit(
          "group:message:deleted",
          update
        );

        console.log("Message deleted for current user only.");

        return callback?.({
          ok: true,
          message: update,
        });
      }

      // =====================================
      // 5. DELETE FOR EVERYONE
      // =====================================

      if (message.isDeleted) {
        return callback?.({
          ok: false,
          message: "This message has already been deleted.",
        });
      }

      // Only the original sender can delete for everyone.
      if (String(message.sender) !== String(userId)) {
        return callback?.({
          ok: false,
          message:
            "Only the sender can delete this message for everyone.",
        });
      }

      console.log("Deleting message for everyone...");
      console.log("isDeleted before:", message.isDeleted);

      // Mark message as deleted.
      message.isDeleted = true;
      message.deletedBy = userId;
      message.deletedAt = new Date();

      // Clear original content.
      message.text = "";
      message.attachment = {
        url: "",
        originalName: "",
        mimeType: "",
        size: 0,
      };
      message.replyTo = null;

      await message.save();

      console.log("isDeleted after:", message.isDeleted);
      console.log("Message successfully deleted for everyone.");

      // =====================================
      // 6. PREPARE SOCKET UPDATE
      // =====================================

      const update = {
        id: message._id.toString(),
        groupId: group._id.toString(),
        deleteType: "deleteForEveryone",
        isDeleted: true,
        deletedBy: String(userId),
        deletedAt: message.deletedAt,
      };

      // =====================================
      // 7. BROADCAST TO GROUP MEMBERS
      // =====================================

      for (const memberId of group.members) {
        io.to(`user:${memberId.toString()}`).emit(
          "group:message:deleted",
          update
        );
      }

      // =====================================
      // 8. SEND SUCCESS RESPONSE
      // =====================================

      return callback?.({
        ok: true,
        message: update,
      });

    } catch (error) {
      console.error(
        "Group message deletion error:",
        error
      );

      return callback?.({
        ok: false,
        message: "Unable to delete group message.",
      });
    }
  });
}