
import http from "node:http";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Server } from "socket.io";
import path from "node:path";
import { fileURLToPath } from "node:url";
import groupCallRoutes from "./routes/groupCalls.js";
import { config } from "./config.js";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import settingsRoutes from "./routes/settings.js";
import conversationRoutes from "./routes/conversations.js";
import groupRoutes from "./routes/groups.js";
import uploadRoutes from "./routes/uploads.js";
import messageRoutes from "./routes/messages.js";

import { configureSocketAuth } from "./utils/socketAuth.js";
import { registerSocketHandlers } from "./sockets/index.js";


const app = express();
const server = http.createServer(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedOrigins = config.clientUrl
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

console.log("Allowed frontend origins:", allowedOrigins);

// CORS — must run before API routes
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin is not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: [
      "GET",
      "HEAD",
      "PUT",
      "PATCH",
      "POST",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Security
app.use(
  helmet({
   crossOriginResourcePolicy: {
    policy: "cross-origin",
   }, 
  })
);

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Middleware
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "chatterbox-api",
  });
});

// API routes
app.use("/api/settings", settingsRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/group-calls", groupCallRoutes);
app.use("/api/uploads", uploadRoutes);

app.use("/api/messages", messageRoutes);

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  maxHttpBufferSize: 1e6,
});

app.set("io", io);

configureSocketAuth(io);
registerSocketHandlers(io);

app.use((error, req, res, next) => {
  console.error("========== API ERROR ==========");
  console.error("URL:", req.method, req.originalUrl);
  console.error("MESSAGE:", error.message);
  console.error("STACK:", error.stack);
  console.error("===============================");

  res.status(500).json({
    message: "An unexpected server error occurred.",
  });
});
// Start server
async function start() {
  try {
    await mongoose.connect(config.mongoUri);

    console.log("Connected to MongoDB");

    server.listen(config.port, () => {
      console.log(
        `Chatterbox API listening on port ${config.port}`
      );
    });
  } catch (error) {
    console.error("Server failed to start:", error);
    process.exit(1);
  }
}

start();
