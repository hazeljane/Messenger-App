
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import User from "../models/User.js";

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.chatterbox_session;

    if (!token) {
      return res.status(401).json({
        message: "Please log in to continue.",
      });
    }

    const payload = jwt.verify(token, config.jwtSecret);

    const user = await User.findById(payload.userId).select(
      "_id username email role theme"
    );

    if (!user) {
      return res.status(401).json({
        message: "Account not found. Please log in again.",
      });
    }

    req.user = user;

    next();
  } catch {
    return res.status(401).json({
      message: "Your session has expired. Please log in again.",
    });
  }
}
