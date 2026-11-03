import { registerGroupMessageHandlers } from "./groupMessageHandlers.js";
import { registerGroupMessageEdit } from "./groupMessageEdit.js";
import { registerGroupMessageDelete } from "./groupMessageDelete.js";
import { registerGroupAttachmentHandlers } from "./groupAttachmentHandlers.js";

import { registerPrivateMessageHandlers } from "./privateMessageHandlers.js";
import { registerPrivateMessageEdit } from "./privateMessageEdit.js";
import { registerPrivateMessageDelete } from "./privateMessageDelete.js";
import { registerCallHandlers } from "./callHandlers.js";
import { registerPresenceHandlers } from "./presenceHandlers.js";

export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    const userId = socket.user.id;

    console.log("User connected:", socket.id);

    // Every authenticated user joins their personal room.
    socket.join(`user:${userId}`);

    // Presence handlers
    registerPresenceHandlers(io, socket);
    registerCallHandlers(io, socket);
    // Private messages
    registerPrivateMessageHandlers(io, socket);
    registerPrivateMessageEdit(io, socket);
    registerPrivateMessageDelete(io, socket);

    // Group messages
    registerGroupMessageHandlers(io, socket);
    registerGroupMessageEdit(io, socket);
    registerGroupMessageDelete(io, socket);
    registerGroupAttachmentHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });
}