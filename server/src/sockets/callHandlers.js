
import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";

const activeCalls = new Map();
const reservedUsers = new Set();
function createConversationKey(userA, userB) {
  return [String(userA), String(userB)].sort().join(":");
}

function getUserRoom(io, userId) {
  return io.sockets.adapter.rooms.get(`user:${userId}`);
}

function isUserInCall(userId) {
  for (const call of activeCalls.values()) {
    if (
      call.callerId === String(userId) ||
      call.recipientId === String(userId)
    ) {
      return true;
    }
  }

  return false;
}

function getCallForUser(callId, userId) {
  const call = activeCalls.get(String(callId));

  if (!call) return null;

  const id = String(userId);

  if (call.callerId !== id && call.recipientId !== id) {
    return null;
  }

  return call;
}

export function registerCallHandlers(io, socket) {
  const userId = String(socket.user.id);

  async function canCall(recipientId) {
    if (!mongoose.isValidObjectId(recipientId)) return false;

    const recipient = String(recipientId);

    if (recipient === userId) return false;

    const conversationKey = createConversationKey(userId, recipient);

    const conversation = await Conversation.findOne({
      conversationKey,
      participants: {
        $all: [
          new mongoose.Types.ObjectId(userId),
          new mongoose.Types.ObjectId(recipient),
        ],
      },
      status: "accepted",
    }).select("_id");

    return Boolean(conversation);
  }
// Start a call.
socket.on("call:start", async (payload, callback) => {
  let recipient = "";

  try {
    const { recipientId, callType, offer } = payload || {};

    recipient = String(recipientId || "");
    if (!mongoose.isValidObjectId(recipient)) {
  return callback?.({
    ok: false,
    message: "Invalid recipient.",
  });
}
    if (!["audio", "video"].includes(callType)) {
      return callback?.({
        ok: false,
        message: "Invalid call type.",
      });
    }

    if (
      !offer ||
      typeof offer !== "object" ||
      offer.type !== "offer" ||
      typeof offer.sdp !== "string" ||
      !offer.sdp.trim()
    ) {
      return callback?.({
        ok: false,
        message: "A valid call offer is required.",
      });
    }

    // Reserve both users before the asynchronous database check.
    if (
      reservedUsers.has(userId) ||
      reservedUsers.has(recipient) ||
      isUserInCall(userId) ||
      isUserInCall(recipient)
    ) {
      return callback?.({
        ok: false,
        message: "One of the users is already in a call.",
      });
    }

    reservedUsers.add(userId);
    reservedUsers.add(recipient);

    try {
      if (!(await canCall(recipient))) {
        return callback?.({
          ok: false,
          message: "Calls are only allowed in accepted conversations.",
        });
      }

      const recipientRoom = getUserRoom(io, recipient);

      if (!recipientRoom || recipientRoom.size === 0) {
        return callback?.({
          ok: false,
          message: "This user is currently offline.",
        });
      }

      const callId = new mongoose.Types.ObjectId().toString();

      const call = {
        callId,
        callerId: userId,
        recipientId: recipient,
        callType,
        status: "ringing",
      };

      activeCalls.set(callId, call);

      io.to(`user:${recipient}`).emit("call:incoming", {
        callId,
        callerId: userId,
        callType,
        offer,
      });

      return callback?.({
        ok: true,
        callId,
      });
    } finally {
      reservedUsers.delete(userId);
      reservedUsers.delete(recipient);
    }
  } catch (error) {
    console.error("Call start error:", error);

    return callback?.({
      ok: false,
      message: "Unable to start the call.",
    });
  }
});
  // Accept or decline an incoming call.
  socket.on("call:respond", async (payload, callback) => {
    try {
      const { callerId, callId, accepted, answer } = payload || {};

      const call = getCallForUser(callId, userId);
      if (!call || call.status === "ended") {
        return;
      }
      if (
        !call ||
        call.callerId !== String(callerId) ||
        call.recipientId !== userId ||
        call.status !== "ringing"
      ) {
        return callback?.({
          ok: false,
          message: "This call is no longer available.",
        });
      }

      if (typeof accepted !== "boolean") {
        return callback?.({
          ok: false,
          message: "Invalid call response.",
        });
      }

      if (accepted) {
        if (
  !answer ||
  typeof answer !== "object" ||
  answer.type !== "answer" ||
  typeof answer.sdp !== "string" ||
  !answer.sdp.trim()
) {
  return callback?.({
    ok: false,
    message: "A valid call answer is required.",
  });
}
const callerRoom = getUserRoom(io, call.callerId);

if (!callerRoom || callerRoom.size === 0) {
  activeCalls.delete(call.callId);

  return callback?.({
    ok: false,
    message: "The caller is no longer available.",
  });
}

        call.status = "accepted";
      } else {
        activeCalls.delete(call.callId);
      }

      io.to(`user:${call.callerId}`).emit("call:response", {
        callId: call.callId,
        recipientId: userId,
        accepted,
        ...(accepted ? { answer } : {}),
      });

      return callback?.({ ok: true });
    } catch (error) {
      console.error("Call response error:", error);

      return callback?.({
        ok: false,
        message: "Unable to respond to the call.",
      });
    }
  });
socket.on("call:ice-candidate", (payload) => {
  try {
    const { recipientId, callId, candidate } = payload || {};

    const call = getCallForUser(callId, userId);

    // Only allow candidates for an active call.
    if (
      !call ||
      !["ringing", "accepted"].includes(call.status)
    ) {
      return;
    }

    if (
      !candidate ||
      typeof candidate !== "object" ||
      typeof candidate.candidate !== "string"
    ) {
      return;
    }

    const otherUserId =
      call.callerId === userId
        ? call.recipientId
        : call.callerId;

    if (String(recipientId) !== otherUserId) {
      return;
    }

    io.to(`user:${otherUserId}`).emit("call:ice-candidate", {
      callId: call.callId,
      senderId: userId,
      candidate,
    });
  } catch (error) {
    console.error("ICE candidate error:", error);
  }
});
  // End an active call.
  socket.on("call:end", (payload) => {
    try {
      const { callId, recipientId } = payload || {};

      const call = getCallForUser(callId, userId);

      if (!call) return;

      const otherUserId =
        call.callerId === userId
          ? call.recipientId
          : call.callerId;

      if (String(recipientId) !== otherUserId) return;

      activeCalls.delete(call.callId);

      io.to(`user:${otherUserId}`).emit("call:ended", {
        callId: call.callId,
        senderId: userId,
      });
    } catch (error) {
      console.error("Call end error:", error);
    }
  });

// Handle a user disconnecting.
socket.on("disconnecting", () => {
  const userRoom = getUserRoom(io, userId);

  // Another socket for this user is still connected.
  if (userRoom && userRoom.size > 1) {
    return;
  }

  for (const [callId, call] of activeCalls.entries()) {
    if (
      call.callerId === userId ||
      call.recipientId === userId
    ) {
      const otherUserId =
        call.callerId === userId
          ? call.recipientId
          : call.callerId;

      activeCalls.delete(callId);

      io.to(`user:${otherUserId}`).emit("call:ended", {
        callId,
        senderId: userId,
      });
    }
  }
});
}
