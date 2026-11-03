
import mongoose from "mongoose";
import { RoomServiceClient } from "livekit-server-sdk";
import Group from "../models/Group.js";
import { config } from "../config.js";

const MAX_PARTICIPANTS = 8;

const activeGroupCalls = new Map();
const startingGroupCalls = new Set();

function getRoomService() {
  if (
    !config.livekitUrl ||
    !config.livekitApiKey ||
    !config.livekitApiSecret
  ) {
    throw new Error("LiveKit configuration is missing.");
  }

  const host = config.livekitUrl.replace(/^wss:/, "https:");

  return new RoomServiceClient(
    host,
    config.livekitApiKey,
    config.livekitApiSecret
  );
}

function getGroupRoomName(groupId) {
  return `chatterbox-group-${groupId}`;
}

async function findMemberGroup(groupId, userId) {
  if (!mongoose.isValidObjectId(groupId)) {
    return null;
  }

  return Group.findOne({
    _id: groupId,
    members: userId,
  }).select("_id name creator");
}

async function emitToGroupMembers(io, group, event, data, excludeUserId) {
  for (const memberId of group.members) {
    const member = String(memberId);

    if (member === String(excludeUserId || "")) {
      continue;
    }

    io.to(`user:${member}`).emit(event, data);
  }
}

export function registerGroupCallHandlers(io, socket) {
  const userId = String(socket.user.id);

  // ==========================================
  // 1. START A GROUP CALL
  // ==========================================

  socket.on("group-call:start", async (payload, callback) => {
    const groupId = String(payload?.groupId || "");
    let roomCreated = false;

    try {
      const { callType } = payload || {};

      if (!mongoose.isValidObjectId(groupId)) {
        return callback?.({
          ok: false,
          message: "Invalid group ID.",
        });
      }

      if (!["audio", "video"].includes(callType)) {
        return callback?.({
          ok: false,
          message: "Invalid call type.",
        });
      }

      const group = await findMemberGroup(groupId, userId);

      if (!group) {
        return callback?.({
          ok: false,
          message: "You are not a member of this group.",
        });
      }

      if (
        activeGroupCalls.has(groupId) ||
        startingGroupCalls.has(groupId)
      ) {
        return callback?.({
          ok: false,
          message: "A group call is already active.",
        });
      }

      // Prevent two users from starting the same call simultaneously.
      startingGroupCalls.add(groupId);

      const callId = new mongoose.Types.ObjectId().toString();
      const roomName = getGroupRoomName(groupId);

      const roomService = getRoomService();

      await roomService.createRoom({
        name: roomName,
        maxParticipants: MAX_PARTICIPANTS,
        emptyTimeout: 300,
      });

      roomCreated = true;

      const call = {
        callId,
        groupId,
        groupName: group.name,
        roomName,
        hostId: userId,
        callType,
        startedAt: new Date(),
      };

      activeGroupCalls.set(groupId, call);

      await emitToGroupMembers(
        io,
        group,
        "group-call:incoming",
        {
          callId,
          groupId,
          groupName: group.name,
          hostId: userId,
          callType,
          startedAt: call.startedAt,
        },
        userId
      );

      return callback?.({
        ok: true,
        call,
        roomName,
      });
    } catch (error) {
      console.error("Group call start error:", error);

      // Clean up only if this handler created the room.
      if (roomCreated) {
        try {
          await getRoomService().deleteRoom(
            getGroupRoomName(groupId)
          );
        } catch (cleanupError) {
          console.error("Group call room cleanup error:", cleanupError);
        }
      }

      return callback?.({
        ok: false,
        message: "Unable to start the group call.",
      });
    } finally {
      startingGroupCalls.delete(groupId);
    }
  });

  // ==========================================
  // 2. JOIN AN ACTIVE GROUP CALL
  // ==========================================

  socket.on("group-call:join", async (payload, callback) => {
    try {
      const groupId = String(payload?.groupId || "");
      const callId = String(payload?.callId || "");

      const call = activeGroupCalls.get(groupId);

      if (!call || call.callId !== callId) {
        return callback?.({
          ok: false,
          message: "Group call not found.",
        });
      }

      const group = await findMemberGroup(groupId, userId);

      if (!group) {
        return callback?.({
          ok: false,
          message: "You are not a member of this group.",
        });
      }

      const roomService = getRoomService();

      const participants = await roomService.listParticipants(
        call.roomName
      );

      const alreadyJoined = participants.some(
        (participant) => participant.identity === userId
      );

      if (
        !alreadyJoined &&
        participants.length >= MAX_PARTICIPANTS
      ) {
        return callback?.({
          ok: false,
          message: `This group call is full. Maximum participants: ${MAX_PARTICIPANTS}.`,
        });
      }

      return callback?.({
        ok: true,
        callId: call.callId,
        groupId,
        roomName: call.roomName,
        hostId: call.hostId,
        callType: call.callType,
        groupName: group.name,
        maxParticipants: MAX_PARTICIPANTS,
      });
    } catch (error) {
      console.error("Group call join error:", error);

      return callback?.({
        ok: false,
        message: "Unable to join the group call.",
      });
    }
  });

  // ==========================================
  // 3. JOIN THE SOCKET.IO NOTIFICATION ROOM
  // ==========================================

  socket.on("group-call:socket-join", async (payload, callback) => {
    try {
      const groupId = String(payload?.groupId || "");
      const callId = String(payload?.callId || "");

      const call = activeGroupCalls.get(groupId);

      if (!call || call.callId !== callId) {
        return callback?.({
          ok: false,
          message: "Group call not found.",
        });
      }

      const group = await findMemberGroup(groupId, userId);

      if (!group) {
        return callback?.({
          ok: false,
          message: "You are not a member of this group.",
        });
      }

      socket.join(`group-call:${callId}`);

      return callback?.({ ok: true });
    } catch (error) {
      console.error("Group call socket join error:", error);

      return callback?.({
        ok: false,
        message: "Unable to join group call notifications.",
      });
    }
  });

  // ==========================================
  // 4. LEAVE A GROUP CALL
  // ==========================================

  socket.on("group-call:leave", async (payload, callback) => {
    try {
      const groupId = String(payload?.groupId || "");
      const callId = String(payload?.callId || "");

      const call = activeGroupCalls.get(groupId);

      if (!call || call.callId !== callId) {
        return callback?.({
          ok: false,
          message: "Group call not found.",
        });
      }

      const group = await findMemberGroup(groupId, userId);

      if (!group) {
        return callback?.({
          ok: false,
          message: "You are not a member of this group.",
        });
      }

      socket.leave(`group-call:${callId}`);

      socket.to(`group-call:${callId}`).emit(
        "group-call:participant-left",
        {
          callId,
          userId,
        }
      );

      return callback?.({ ok: true });
    } catch (error) {
      console.error("Group call leave error:", error);

      return callback?.({
        ok: false,
        message: "Unable to leave the group call.",
      });
    }
  });

  // ==========================================
  // 5. END A GROUP CALL
  // ==========================================

  socket.on("group-call:end", async (payload, callback) => {
    try {
      const groupId = String(payload?.groupId || "");
      const callId = String(payload?.callId || "");

      const call = activeGroupCalls.get(groupId);

      if (!call || call.callId !== callId) {
        return callback?.({
          ok: false,
          message: "Group call not found.",
        });
      }

      if (call.hostId !== userId) {
        return callback?.({
          ok: false,
          message: "Only the call host can end this call.",
        });
      }

      const group = await findMemberGroup(groupId, userId);

      if (!group) {
        return callback?.({
          ok: false,
          message: "You are not a member of this group.",
        });
      }

      activeGroupCalls.delete(groupId);

      try {
        await getRoomService().deleteRoom(call.roomName);
      } catch (error) {
        console.error("LiveKit room deletion error:", error);
      }

      io.to(`group-call:${callId}`).emit("group-call:ended", {
        callId,
        groupId,
        endedBy: userId,
      });

      await emitToGroupMembers(
        io,
        group,
        "group-call:ended",
        {
          callId,
          groupId,
          endedBy: userId,
        }
      );

      return callback?.({ ok: true });
    } catch (error) {
      console.error("Group call end error:", error);

      return callback?.({
        ok: false,
        message: "Unable to end the group call.",
      });
    }
  });
}
