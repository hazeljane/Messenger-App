
import { registerGroupMessageHandlers } from "./groupMessageHandlers.js";
import { registerGroupMessageEdit } from "./groupMessageEdit.js";
import { registerGroupMessageDelete } from "./groupMessageDelete.js";
import { registerGroupAttachmentHandlers } from "./groupAttachmentHandlers.js";

import { registerPrivateMessageHandlers } from "./privateMessageHandlers.js";
import { registerPrivateMessageEdit } from "./privateMessageEdit.js";
import { registerPrivateMessageDelete } from "./privateMessageDelete.js";

import { registerCallHandlers } from "./callHandlers.js";
import { registerPresenceHandlers } from "./presenceHandlers.js";
import { registerGroupCallHandlers } from "./groupCallHandlers.js";

export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    const userId = String(socket.user.id);

    console.log("User connected:", socket.id);

    // Every authenticated user joins their personal room.
    socket.join(`user:${userId}`);

    // =====================================
    // PRESENCE
    // =====================================

    registerPresenceHandlers(io, socket);

    // =====================================
    // PRIVATE CALLS
    // =====================================

    registerCallHandlers(io, socket);

    // =====================================
    // GROUP CALLS
    // =====================================

    registerGroupCallHandlers(io, socket);

    // =====================================
    // PRIVATE MESSAGES
    // =====================================

    registerPrivateMessageHandlers(io, socket);
    registerPrivateMessageEdit(io, socket);
    registerPrivateMessageDelete(io, socket);

    // =====================================
    // GROUP MESSAGES
    // =====================================

    registerGroupMessageHandlers(io, socket);
    registerGroupMessageEdit(io, socket);
    registerGroupMessageDelete(io, socket);
    registerGroupAttachmentHandlers(io, socket);

    // =====================================
    // DISCONNECT
    // =====================================

    socket.on("disconnect", (reason) => {
      console.log("User disconnected:", socket.id, reason);
    });
  });
}
