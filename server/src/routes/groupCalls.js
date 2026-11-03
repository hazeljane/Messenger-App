
import { Router } from "express";
import mongoose from "mongoose";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

import Group from "../models/Group.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { config } from "../config.js";

const router = Router();

const MAX_PARTICIPANTS = 8;

function getLiveKitClients() {
  const {
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
  } = config;

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    throw new Error("LiveKit credentials are not configured.");
  }

  const host = livekitUrl.replace(/^wss:/i, "https:");

  return {
    roomService: new RoomServiceClient(
      host,
      livekitApiKey,
      livekitApiSecret
    ),
  };
}

// Generate a secure token for a verified group member.
router.post("/:groupId/token", requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = String(req.user._id);

    if (!mongoose.isValidObjectId(groupId)) {
      return res.status(400).json({
        message: "Invalid group ID.",
      });
    }

    const group = await Group.findOne({
      _id: groupId,
      members: req.user._id,
    }).select("_id name members");

    if (!group) {
      return res.status(403).json({
        message: "You are not a member of this group.",
      });
    }

    const { roomService } = getLiveKitClients();

    const roomName = `chatterbox-group-${group._id}`;

    // Create the room with an enforced 8-participant limit.
    const existingRooms = await roomService.listRooms([roomName]);

    if (!existingRooms.length) {
      try {
        await roomService.createRoom({
          name: roomName,
          emptyTimeout: 300,
          maxParticipants: MAX_PARTICIPANTS,
        });
      } catch (error) {
        // Another request may have created the room first.
        const roomsAfterError = await roomService.listRooms([roomName]);

        if (!roomsAfterError.length) {
          throw error;
        }
      }
    }

    const participants = await roomService.listParticipants(roomName);

    if (
      !participants.some(
        (participant) => participant.identity === userId
      ) &&
      participants.length >= MAX_PARTICIPANTS
    ) {
      return res.status(409).json({
        message: "This group call is full. Maximum 8 participants.",
      });
    }

    const accessToken = new AccessToken(
      config.livekitApiKey,
      config.livekitApiSecret,
      {
        identity: userId,
        name: req.user.username || "Chatterbox Member",
        ttl: "10m",
      }
    );

    accessToken.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const participantToken = await accessToken.toJwt();

    return res.json({
      serverUrl: config.livekitUrl,
      token: participantToken,
      roomName,
      group: {
        id: group._id.toString(),
        name: group.name,
      },
      maxParticipants: MAX_PARTICIPANTS,
    });
  } catch (error) {
    console.error("Group call token error:", error);

    if (error.message === "LiveKit credentials are not configured.") {
      return res.status(503).json({
        message: "Group calling is not configured yet.",
      });
    }

    return res.status(500).json({
      message: "Unable to join the group call.",
    });
  }
});

export default router;
