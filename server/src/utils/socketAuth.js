
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import User from "../models/User.js";

export function configureSocketAuth(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      // Read the HTTP-only session cookie.
      const cookieHeader = socket.handshake.headers.cookie || "";

      const cookieToken = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) =>
          part.startsWith("chatterbox_session=")
        )
        ?.slice("chatterbox_session=".length);

      const chosenToken = token || cookieToken;

      if (!chosenToken) {
        return next(new Error("Authentication required"));
      }

      const payload = jwt.verify(
        decodeURIComponent(chosenToken),
        config.jwtSecret
      );

      const user = await User.findById(payload.userId).select(
        "_id username email role"
      );

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role || "member",
      };

      next();
    } catch (error) {
      console.error("Socket authentication error:", error.message);
      next(new Error("Invalid session"));
    }
  });
}
