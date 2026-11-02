
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// Cookie settings for local development and production
// Cookie settings for local development and production
function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    role: user.role || "member",
    theme: user.theme || "light",
  };
}

// SIGN UP
router.post("/signup", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (username.length < 2 || username.length > 30) {
      return res.status(400).json({
        message: "Username must be between 2 and 30 characters.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({
        message: "Enter a valid email address.",
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        message: "Password must be at least 8 characters.",
      });
    }

    const existing = await User.findOne({
      $or: [
        { email },
        { usernameLower: username.toLowerCase() },
      ],
    });

    if (existing) {
      return res.status(409).json({
        message: "That email or username is already registered.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      username,
      usernameLower: username.toLowerCase(),
      email,
      passwordHash,
    });

    const token = jwt.sign(
      { userId: user._id.toString() },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    res.cookie("chatterbox_session", token, cookieOptions());

    return res.status(201).json({
      user: publicUser(user),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "That email or username is already registered.",
      });
    }

    console.error("Signup error:", error);

    return res.status(500).json({
      message: "Could not create account. Please try again.",
    });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const login = String(req.body.login || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!login || !password) {
      return res.status(400).json({
        message: "Enter your username/email and password.",
      });
    }

    const user = await User.findOne({
  $or: [
    { email: login },
    { usernameLower: login },
  ],
}).select(
  "+passwordHash username email usernameLower role theme"
);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        message: "Incorrect username/email or password.",
      });
    }

    const token = jwt.sign(
      { userId: user._id.toString() },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    res.cookie("chatterbox_session", token, cookieOptions());

    return res.json({
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Could not log in. Please try again.",
    });
  }
});

// CURRENT USER
router.get("/me", requireAuth, (req, res) => {
  res.json({
    user: publicUser(req.user),
  });
});

// LOGOUT
router.post("/logout", (_req, res) => {
  res.clearCookie("chatterbox_session", {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
  });

  res.json({
    message: "Logged out successfully.",
  });
});

export default router;
