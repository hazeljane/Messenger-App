
import dotenv from "dotenv";

dotenv.config();

const required = ["MONGODB_URI", "JWT_SECRET"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      "Check your server environment variables."
    );
  }
}

export const config = {
  port: Number(process.env.PORT || 5000),

  nodeEnv: process.env.NODE_ENV || "development",

  mongoUri: process.env.MONGODB_URI,

  jwtSecret: process.env.JWT_SECRET,

  // Frontend URL
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",

  // Cookie settings
  cookieSecure:
    process.env.COOKIE_SECURE === "true",

  cookieSameSite:
    process.env.COOKIE_SAME_SITE || "lax",

  // LiveKit
  livekitUrl: process.env.LIVEKIT_URL,
  livekitApiKey: process.env.LIVEKIT_API_KEY,
  livekitApiSecret: process.env.LIVEKIT_API_SECRET,

  maxGroupCallParticipants: 8,
};
