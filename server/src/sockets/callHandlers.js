
import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Call from "../models/Call.js";
import User from "../models/User.js";
import { sendCallNotification } from "../utils/sendCallNotification.js";

const reservedUsers = new Set();
const callTimers = new Map();

const CALL_RING_TIMEOUT = 45_000;

function createConversationKey(userA, userB) {
  return [String(userA), String(userB)].sort().join(":");
}

function getUserRoom(io, userId) {
  return io.sockets.adapter.rooms.get(`user:${userId}`);
}

function isUserConnected(io, userId) {
  const room = getUserRoom(io, userId);
  return Boolean(room && room.size > 0);
}

function clearCallTimer(callId) {
  const id = String(callId);
  const timer = callTimers.get(id);

  if (timer) clearTimeout(timer);

  callTimers.delete(id);
}

function getOtherUserId(call, userId) {
  return String(call.caller) === String(userId)
    ? String(call.receiver)
    : String(call.caller);
}

async function findCallForUser(callId, userId) {
  if (!callId || !mongoose.isValidObjectId(callId)) {
    return null;
  }

  return Call.findOne({
    callId: String(callId),
    $or: [
      { caller: userId },
      { receiver: userId },
    ],
  }).select("+offer +answer");
}

async function expireCall(io, callId) {
  const now = new Date();

  const call = await Call.findOneAndUpdate(
    {
      callId: String(callId),
      status: "ringing",
      expiresAt: { $lte: now },
    },
    {
      $set: {
        status: "missed",
        endedAt: now,
      },
    },
    { new: true }
  );

  clearCallTimer(callId);

  if (!call) return;

  io.to(`user:${call.caller}`).emit("call:missed", {
    callId: call.callId,
    recipientId: String(call.receiver),
  });

  io.to(`user:${call.receiver}`).emit("call:missed", {
    callId: call.callId,
    callerId: String(call.caller),
  });
}

function scheduleCallExpiry(io, call) {
  clearCallTimer(call.callId);

  const remaining = new Date(call.expiresAt).getTime() - Date.now();

  if (remaining <= 0) {
    expireCall(io, call.callId).catch((error) => {
      console.error("Call expiration error:", error);
    });
    return;
  }

  const timer = setTimeout(() => {
    expireCall(io, call.callId).catch((error) => {
      console.error("Call expiration error:", error);
    });
  }, remaining);

  callTimers.set(String(call.callId), timer);
}

export function registerCallHandlers(io, socket) {
  const userId = String(socket.user.id);

  async function canCall(recipientId) {
    if (!mongoose.isValidObjectId(recipientId)) return false;
    if (recipientId === userId) return false;

    const conversation = await Conversation.findOne({
      conversationKey: createConversationKey(userId, recipientId),
      participants: {
        $all: [
          new mongoose.Types.ObjectId(userId),
          new mongoose.Types.ObjectId(recipientId),
        ],
      },
      status: "accepted",
    }).select("_id");

    return Boolean(conversation);
  }


  async function hasActiveCall(participantId) {
    const now = new Date();

    return Boolean(
      await Call.findOne({
        $and: [
          {
            $or: [
              { caller: participantId },
              { receiver: participantId },
            ],
          },
          {
            $or: [
              { status: "accepted" },
              {
                status: "ringing",
                expiresAt: { $gt: now },
              },
            ],
          },
        ],
      }).select("_id")
    );
  }

  // =========================================
  // START A CALL
  // =========================================

  socket.on("call:start", async (payload, callback) => {
    let recipientId = "";

    try {
      const { recipientId: requestedRecipient, callType, offer } =
        payload || {};

      recipientId = String(requestedRecipient || "");

      if (!mongoose.isValidObjectId(recipientId)) {
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

      if (
        reservedUsers.has(userId) ||
        reservedUsers.has(recipientId)
      ) {
        return callback?.({
          ok: false,
          message: "One of the users is already starting a call.",
        });
      }

      reservedUsers.add(userId);
      reservedUsers.add(recipientId);

      try {
        if (!(await canCall(recipientId))) {
          return callback?.({
            ok: false,
            message:
              "Calls are only allowed in accepted conversations.",
          });
        }

        if (
          (await hasActiveCall(userId)) ||
          (await hasActiveCall(recipientId))
        ) {
          return callback?.({
            ok: false,
            message: "One of the users is already in a call.",
          });
        }

        const callId = new mongoose.Types.ObjectId().toString();
        const expiresAt = new Date(Date.now() + CALL_RING_TIMEOUT);

        const savedCall = await Call.create({
          callId,
          caller: userId,
          receiver: recipientId,
          callType,
          status: "ringing",
          offer,
          expiresAt,
          startedAt: new Date(),
        });

        scheduleCallExpiry(io, savedCall);

        const caller = await User.findById(userId)
          .select("username")
          .lean();

        const callerName = caller?.username || "Chatterbox user";

        // Deliver the invitation through Socket.IO when connected.
if (isUserConnected(io, recipientId)) {
  io.to(`user:${recipientId}`).emit("call:incoming", {
    callId,
    callerId: userId,
    callType,
    offer,
    callerName,
    expiresAt: expiresAt.toISOString(),
  });
}

// Also send a data-only FCM notification to Android devices.
const recipient = await User.findById(recipientId)
  .select("fcmTokens")
  .lean();

await sendCallNotification(recipient, {
  callId,
  callerId: userId,
  callerName,
  callType,
  expiresAt,
});

        return callback?.({
          ok: true,
          callId,
        });
      } finally {
        reservedUsers.delete(userId);
        reservedUsers.delete(recipientId);
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
  // RECOVER AN INCOMING CALL
  // =========================================

  socket.on("call:recover", async (payload, callback) => {
    try {
      const { callId } = payload || {};

      if (!callId) {
        return callback?.({
          ok: false,
          message: "Missing call ID.",
        });
      }

      const call = await findCallForUser(callId, userId);
console.log("CALL RECOVERY OFFER CHECK:", {
  found: Boolean(call),
  callId: call?.callId,
  hasOffer: Boolean(call?.offer),
  offerType: call?.offer?.type,
  hasSdp: Boolean(call?.offer?.sdp),
  sdpLength: call?.offer?.sdp?.length || 0,
});
      if (
        !call ||
        String(call.receiver) !== String(userId) ||
        call.status !== "ringing"
      ) {
        return callback?.({
          ok: false,
          message: "This incoming call is no longer available.",
        });
      }

      if (
        !call.expiresAt ||
        new Date(call.expiresAt).getTime() <= Date.now()
      ) {
        await expireCall(io, call.callId);

        return callback?.({
          ok: false,
          message: "This call has expired.",
        });
      }

const caller = await User.findById(call.caller)
  .select("username")
  .lean();

      return callback?.({
        ok: true,
        call: {
          callId: call.callId,
          callerId: String(call.caller),
          callerName:
            caller?.username || "Chatterbox user",
          callType: call.callType === "voice" ? "audio" : call.callType,
          offer: call.offer,
          expiresAt: call.expiresAt,
        },
      });
    } catch (error) {
      console.error("Call recovery error:", error);

      return callback?.({
        ok: false,
        message: "Unable to recover this incoming call.",
      });
    }
  });

  // =========================================
  // ACCEPT OR DECLINE A CALL
  // =========================================

  socket.on("call:respond", async (payload, callback) => {
    try {
      const { callerId, callId, accepted, answer } = payload || {};

      if (typeof accepted !== "boolean") {
        return callback?.({
          ok: false,
          message: "Invalid call response.",
        });
      }

      if (!mongoose.isValidObjectId(callerId)) {
        return callback?.({
          ok: false,
          message: "Invalid caller.",
        });
      }


const call = await findCallForUser(callId, userId);
if (
  !call ||
  String(call.receiver) !== String(userId) ||
  call.status !== "ringing"
) {
  return callback?.({
    ok: false,
    message: "This incoming call is no longer available.",
  });
}

      if (new Date(call.expiresAt).getTime() <= Date.now()) {
        await expireCall(io, call.callId);

        return callback?.({
          ok: false,
          message: "This call has expired.",
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

        if (!isUserConnected(io, call.caller)) {
          return callback?.({
            ok: false,
            message: "The caller is no longer available.",
          });
        }
      }

      const now = new Date();

      const updatedCall = await Call.findOneAndUpdate(
        {
          callId: call.callId,
          receiver: userId,
          caller: callerId,
          status: "ringing",
          expiresAt: { $gt: now },
        },
        accepted
          ? {
              $set: {
                status: "accepted",
                answer,
                answeredAt: now,
              },
            }
          : {
              $set: {
                status: "declined",
                endedAt: now,
              },
            },
        { new: true }
      );

      if (!updatedCall) {
        return callback?.({
          ok: false,
          message: "This call is no longer available.",
        });
      }

      clearCallTimer(call.callId);

      io.to(`user:${call.caller}`).emit("call:response", {
        callId: call.callId,
        recipientId: userId,
        accepted,
        ...(accepted ? { answer } : {}),
      });

      if (!accepted) {
        io.to(`user:${call.caller}`).emit("call:declined", {
          callId: call.callId,
          recipientId: userId,
        });
      }

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

  socket.on("call:cancel", async (payload, callback) => {
    try {
      const { callId } = payload || {};

      const call = await findCallForUser(callId, userId);

      if (
        !call ||
        String(call.caller) !== userId ||
        call.status !== "ringing"
      ) {
        return callback?.({
          ok: false,
          message: "Call cannot be cancelled.",
        });
      }

      const updatedCall = await Call.findOneAndUpdate(
        {
          callId: call.callId,
          caller: userId,
          status: "ringing",
        },
        {
          $set: {
            status: "cancelled",
            endedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!updatedCall) {
        return callback?.({
          ok: false,
          message: "Call cannot be cancelled.",
        });
      }

      clearCallTimer(call.callId);

      io.to(`user:${call.receiver}`).emit("call:cancelled", {
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

  socket.on("call:ice-candidate", async (payload) => {
    try {
      const { recipientId, callId, candidate } = payload || {};

      const call = await findCallForUser(callId, userId);

      if (
        !call ||
        !["ringing", "accepted"].includes(call.status)
      ) {
        return;
      }

      if (
        call.status === "ringing" &&
        new Date(call.expiresAt).getTime() <= Date.now()
      ) {
        await expireCall(io, call.callId);
        return;
      }

      if (
        !candidate ||
        typeof candidate !== "object" ||
        typeof candidate.candidate !== "string"
      ) {
        return;
      }

      const otherUserId = getOtherUserId(call, userId);

      if (String(recipientId) !== otherUserId) return;

      io.to(`user:${otherUserId}`).emit("call:ice-candidate", {
        callId: call.callId,
        senderId: userId,
        candidate,
      });
    } catch (error) {
      console.error("ICE candidate error:", error);
    }
  });

  // =========================================
  // END AN ACTIVE CALL
  // =========================================

  socket.on("call:end", async (payload) => {
    try {
      const { callId, recipientId } = payload || {};

      const call = await findCallForUser(callId, userId);

      if (!call || call.status !== "accepted") return;

      const otherUserId = getOtherUserId(call, userId);

      if (String(recipientId) !== otherUserId) return;

      const now = new Date();
      const duration = call.answeredAt
        ? Math.max(0, Math.floor((now - call.answeredAt) / 1000))
        : 0;

      const updatedCall = await Call.findOneAndUpdate(
        {
          callId: call.callId,
          status: "accepted",
        },
        {
          $set: {
            status: "ended",
            endedAt: now,
            duration,
          },
        },
        { new: true }
      );

      if (!updatedCall) return;

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

  socket.on("disconnecting", async () => {
    try {
      const userRoom = getUserRoom(io, userId);

      // Another socket for this user is still connected.
      if (userRoom && userRoom.size > 1) return;

      const calls = await Call.find({
        $or: [
          { caller: userId },
          { receiver: userId },
        ],
        status: { $in: ["ringing", "accepted"] },
      }).select("callId caller receiver status");

      for (const call of calls) {
        // A recipient disconnecting must not destroy a ringing
        // invitation. The invitation remains available for recovery.
        if (
          call.status === "ringing" &&
          String(call.receiver) === userId
        ) {
          continue;
        }

        const otherUserId = getOtherUserId(call, userId);
        const now = new Date();

        const newStatus =
          call.status === "ringing" ? "cancelled" : "ended";

        const updatedCall = await Call.findOneAndUpdate(
          {
            callId: call.callId,
            status: call.status,
          },
          {
            $set: {
              status: newStatus,
              endedAt: now,
            },
          },
          { new: true }
        );

        if (!updatedCall) continue;

        clearCallTimer(call.callId);

        io.to(`user:${otherUserId}`).emit("call:ended", {
          callId: call.callId,
          senderId: userId,
        });
      }
    } catch (error) {
      console.error("Call disconnect cleanup error:", error);
    }
  });
}
