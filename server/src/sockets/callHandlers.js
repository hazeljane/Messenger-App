
import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";

const activeCalls = new Map();
const reservedUsers = new Set();
const callTimers = new Map();

const CALL_RING_TIMEOUT = 45_000; // 45 seconds

// Create a consistent conversation key for two users.
function createConversationKey(userA, userB) {
  return [String(userA), String(userB)].sort().join(":");
}

// Get all connected sockets belonging to a user.
function getUserRoom(io, userId) {
  return io.sockets.adapter.rooms.get(`user:${userId}`);
}

// Check whether a user is already in a call.
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

// Get a call only if the requesting user is a participant.
function getCallForUser(callId, userId) {
  const call = activeCalls.get(String(callId));

  if (!call) return null;

  const id = String(userId);

  if (call.callerId !== id && call.recipientId !== id) {
    return null;
  }

  return call;
}

// Clear a call's ringing timeout.
function clearCallTimer(callId) {
  const id = String(callId);
  const timer = callTimers.get(id);

  if (timer) {
    clearTimeout(timer);
  }

  callTimers.delete(id);
}

// Remove a call and its associated timer.
function removeCall(callId) {
  const id = String(callId);

  clearCallTimer(id);
  activeCalls.delete(id);
}

export function registerCallHandlers(io, socket) {
  const userId = String(socket.user.id);

  // Check whether two users have an accepted conversation.
  async function canCall(recipientId) {
    if (!mongoose.isValidObjectId(recipientId)) {
      return false;
    }

    const recipient = String(recipientId);

    if (recipient === userId) {
      return false;
    }

    const conversationKey = createConversationKey(
      userId,
      recipient
    );

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

  // =========================================
  // START A CALL
  // =========================================

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

      // Prevent simultaneous calls.
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

      // Reserve both users while checking the database.
      reservedUsers.add(userId);
      reservedUsers.add(recipient);

      try {
        if (!(await canCall(recipient))) {
          return callback?.({
            ok: false,
            message:
              "Calls are only allowed in accepted conversations.",
          });
        }

        const recipientRoom = getUserRoom(io, recipient);

        if (!recipientRoom || recipientRoom.size === 0) {
          return callback?.({
            ok: false,
            message: "This user is currently offline.",
          });
        }

        // Create a unique call ID.
        const callId = new mongoose.Types.ObjectId().toString();

        const call = {
          callId,
          callerId: userId,
          recipientId: recipient,
          callType,
          status: "ringing",
        };

        activeCalls.set(callId, call);

        // Automatically mark the call as missed after 45 seconds.
        const timeout = setTimeout(() => {
          const currentCall = activeCalls.get(callId);

          if (!currentCall || currentCall.status !== "ringing") {
            callTimers.delete(callId);
            return;
          }

          removeCall(callId);

          io.to(`user:${currentCall.callerId}`).emit(
            "call:missed",
            {
              callId,
              recipientId: currentCall.recipientId,
            }
          );

          io.to(`user:${currentCall.recipientId}`).emit(
            "call:missed",
            {
              callId,
              callerId: currentCall.callerId,
            }
          );
        }, CALL_RING_TIMEOUT);

        callTimers.set(callId, timeout);

        // Notify the recipient.
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
        // Always release both reservations.
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

  // =========================================
  // ACCEPT OR DECLINE A CALL
  // =========================================

  socket.on("call:respond", async (payload, callback) => {
    try {
      const { callerId, callId, accepted, answer } = payload || {};

      const call = getCallForUser(callId, userId);

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

      // Validate the WebRTC answer before accepting.
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

        // Make sure the caller is still connected.
        const callerRoom = getUserRoom(io, call.callerId);

        if (!callerRoom || callerRoom.size === 0) {
          removeCall(call.callId);

          return callback?.({
            ok: false,
            message: "The caller is no longer available.",
          });
        }
      }

      // Clear the timeout only after validation succeeds.
      clearCallTimer(call.callId);

      if (accepted) {
        call.status = "accepted";
      } else {
        removeCall(call.callId);
      }

      // Notify the caller.
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

  // =========================================
  // CANCEL AN OUTGOING CALL
  // =========================================

  socket.on("call:cancel", (payload, callback) => {
    try {
      const { callId } = payload || {};

      const call = getCallForUser(callId, userId);

      // Only the caller can cancel a ringing call.
      if (
        !call ||
        call.callerId !== userId ||
        call.status !== "ringing"
      ) {
        return callback?.({
          ok: false,
          message: "Call cannot be cancelled.",
        });
      }

      const recipientId = call.recipientId;

      removeCall(call.callId);

      io.to(`user:${recipientId}`).emit("call:cancelled", {
        callId: call.callId,
        callerId: userId,
      });

      return callback?.({ ok: true });
    } catch (error) {
      console.error("Call cancellation error:", error);

      return callback?.({
        ok: false,
        message: "Unable to cancel the call.",
      });
    }
  });

  // =========================================
  // WEBRTC ICE CANDIDATES
  // =========================================

  socket.on("call:ice-candidate", (payload) => {
    try {
      const { recipientId, callId, candidate } = payload || {};

      const call = getCallForUser(callId, userId);

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

      io.to(`user:${otherUserId}`).emit(
        "call:ice-candidate",
        {
          callId: call.callId,
          senderId: userId,
          candidate,
        }
      );
    } catch (error) {
      console.error("ICE candidate error:", error);
    }
  });

  // =========================================
  // END AN ACTIVE CALL
  // =========================================

  socket.on("call:end", (payload) => {
    try {
      const { callId, recipientId } = payload || {};

      const call = getCallForUser(callId, userId);

      if (!call) return;

      const otherUserId =
        call.callerId === userId
          ? call.recipientId
          : call.callerId;

      if (String(recipientId) !== otherUserId) {
        return;
      }

      removeCall(call.callId);

      io.to(`user:${otherUserId}`).emit("call:ended", {
        callId: call.callId,
        senderId: userId,
      });
    } catch (error) {
      console.error("Call end error:", error);
    }
  });

  // =========================================
  // HANDLE USER DISCONNECTING
  // =========================================

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

        removeCall(callId);

        io.to(`user:${otherUserId}`).emit("call:ended", {
          callId,
          senderId: userId,
        });
      }
    }
  });
}
