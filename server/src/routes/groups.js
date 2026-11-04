
import { Router } from "express";
import mongoose from "mongoose";
import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// Get groups that the logged-in user belongs to
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const groups = await Group.find({
      members: req.user._id,
    })
      .populate("members", "_id username")
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      groups: groups.map((group) => ({
  id: group._id.toString(),
  name: group.name,
  creatorId: group.creator.toString(),
  background: group.background || "default",
  members: group.members.map((member) => ({
    id: member._id.toString(),
    username: member.username,
  })),
})),
    });
  } catch (error) {
    next(error);
  }
});

 // Delete a group and its messages
router.delete("/:groupId", requireAuth, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    // Check whether the group ID is valid
    if (!mongoose.isValidObjectId(groupId)) {
      return res.status(400).json({
        message: "Invalid group ID.",
      });
    }

    // Only the creator can delete the group
    const group = await Group.findOne({
      _id: groupId,
      creator: req.user._id,
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found or you are not allowed to delete it.",
      });
    }

    // Delete all messages belonging to this group
    await GroupMessage.deleteMany({
      group: group._id,
    });

    // Delete the group itself
    await Group.deleteOne({
      _id: group._id,
    });

    return res.json({
      message: "Group deleted successfully.",
      groupId: group._id.toString(),
    });
  } catch (error) {
    next(error);
  }
});

// Create a group
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const requestedMembers = req.body?.memberIds;

    if (name.length < 2 || name.length > 50) {
      return res.status(400).json({
        message: "Group name must be between 2 and 50 characters.",
      });
    }

    if (
      !Array.isArray(requestedMembers) ||
      requestedMembers.length < 1 ||
      requestedMembers.length > 49
    ) {
      return res.status(400).json({
        message: "Choose between 1 and 49 other members.",
      });
    }

    const memberIds = [
      ...new Set([
        String(req.user._id),
        ...requestedMembers.map(String),
      ]),
    ];

    if (
      memberIds.some((id) => !mongoose.isValidObjectId(id))
    ) {
      return res.status(400).json({
        message: "One or more member IDs are invalid.",
      });
    }

    const users = await User.find({
      _id: { $in: memberIds },
    }).select("_id");

    if (users.length !== memberIds.length) {
      return res.status(400).json({
        message: "One or more selected users do not exist.",
      });
    }

    const group = await Group.create({
      name,
      creator: req.user._id,
      members: memberIds,
    });

    const savedGroup = await Group.findById(group._id)
      .populate("members", "_id username")
      .lean();

    res.status(201).json({
      group: {
        id: savedGroup._id.toString(),
        name: savedGroup.name,
        creatorId: savedGroup.creator.toString(),
        background: savedGroup.background || "default",
        members: savedGroup.members.map((member) => ({
          id: member._id.toString(),
          username: member.username,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Load a group's message history
router.get("/:groupId/messages", requireAuth, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.isValidObjectId(groupId)) {
      return res.status(400).json({
        message: "Invalid group ID.",
      });
    }

    const group = await Group.findOne({
      _id: groupId,
      members: req.user._id,
    }).select("_id");

    if (!group) {
      return res.status(404).json({
        message: "Group not found.",
      });
    }

    const messages = await GroupMessage.find({
  group: group._id,
})
  .sort({ createdAt: 1 })
  .limit(500)
  .populate("sender", "_id username")
  .populate({
    path: "replyTo",
    select: "_id text sender isDeleted deletedBy",
    populate: {
      path: "sender",
      select: "_id username",
    },
  })
  .lean();

   
res.json({
  messages: messages.map((message) => ({
    id: message._id.toString(),
    groupId: message.group.toString(),
    senderId: message.sender._id.toString(),
    senderName: message.sender.username,
    text: message.text,
    attachment: message.attachment?.url
      ? {
          url: message.attachment.url,
          originalName: message.attachment.originalName,
          mimeType: message.attachment.mimeType,
          size: message.attachment.size,
        }
      : null,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  })),
});

  } catch (error) {
    next(error);
  }
});

// Add multiple members to an existing group
router.patch("/:groupId/members", requireAuth, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const requestedMembers = req.body?.memberIds;

    if (!mongoose.isValidObjectId(groupId)) {
      return res.status(400).json({
        message: "Invalid group ID.",
      });
    }

    if (
      !Array.isArray(requestedMembers) ||
      requestedMembers.length === 0
    ) {
      return res.status(400).json({
        message: "Please select at least one member.",
      });
    }

    if (
      requestedMembers.some(
        (id) => !mongoose.isValidObjectId(String(id))
      )
    ) {
      return res.status(400).json({
        message: "One or more member IDs are invalid.",
      });
    }

    // Only the group creator can add members.
    const group = await Group.findOne({
      _id: groupId,
      creator: req.user._id,
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found or you are not allowed to add members.",
      });
    }

    // Remove duplicate IDs and existing members.
    const newMemberIds = [
      ...new Set(requestedMembers.map(String)),
    ].filter(
      (id) => !group.members.some(
        (memberId) => String(memberId) === id
      )
    );

    if (newMemberIds.length === 0) {
      return res.status(400).json({
        message: "All selected users are already members.",
      });
    }

    if (group.members.length + newMemberIds.length > 50) {
      return res.status(400).json({
        message: "A group can have a maximum of 50 members.",
      });
    }

    const users = await User.find({
      _id: { $in: newMemberIds },
    }).select("_id username");

    if (users.length !== newMemberIds.length) {
      return res.status(400).json({
        message: "One or more selected users do not exist.",
      });
    }

    group.members.push(...newMemberIds);
    await group.save();

    const updatedGroup = await Group.findById(group._id)
      .populate("members", "_id username")
      .lean();

    const result = {
      id: updatedGroup._id.toString(),
      name: updatedGroup.name,
      creatorId: updatedGroup.creator.toString(),
      background: updatedGroup.background || "default",
      members: updatedGroup.members.map((member) => ({
        id: member._id.toString(),
        username: member.username,
      })),
    };

    // Notify existing and newly added members.
    const io = req.app.get("io");

    for (const member of updatedGroup.members) {
      io?.to(`user:${member._id.toString()}`).emit(
        "group:members:updated",
        { group: result }
      );
    }

    return res.json({
      message: "Members added successfully.",
      group: result,
    });
  } catch (error) {
    next(error);
  }
});

// Change a group's shared background
router.patch("/:groupId/background", requireAuth, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { background } = req.body || {};

    const allowedBackgrounds = [
      "default",
      "lavender",
      "ocean",
      "sunset",
      "forest",
      "rose",
      "mint",
      "peach",
      "night",
      "sky",
    ];

    if (!mongoose.isValidObjectId(groupId)) {
      return res.status(400).json({
        message: "Invalid group ID.",
      });
    }

    if (!allowedBackgrounds.includes(background)) {
      return res.status(400).json({
        message: "Invalid background.",
      });
    }

    const group = await Group.findOne({
      _id: groupId,
      members: req.user._id,
    }).populate("members", "_id username");

    if (!group) {
      return res.status(404).json({
        message: "Group not found or you are not a member.",
      });
    }

    group.background = background;
    await group.save();

    const update = {
      groupId: group._id.toString(),
      background: group.background,
      changedBy: {
        id: String(req.user._id),
        username: req.user.username,
      },
    };

    const io = req.app.get("io");

    for (const member of group.members) {
      io?.to(`user:${member._id.toString()}`).emit(
        "group:background:updated",
        update
      );
    }

    return res.json({
      message: "Group background updated.",
      ...update,
    });
  } catch (error) {
    next(error);
  }
});

// Get a group's saved background
router.get("/:groupId/background", requireAuth, async (req, res, next) => {
  try {
    const { groupId } = req.params;

    // Validate group ID
    if (!mongoose.isValidObjectId(groupId)) {
      return res.status(400).json({
        message: "Invalid group ID.",
      });
    }

    // Find the group and verify membership
    const group = await Group.findOne({
      _id: groupId,
      members: req.user._id,
    }).select("_id background");

    if (!group) {
      return res.status(404).json({
        message: "Group not found or you are not a member.",
      });
    }

    // Return the saved background
    return res.json({
      groupId: group._id.toString(),
      background: group.background || "default",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
