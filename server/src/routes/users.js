
import { Router } from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// ==========================================
// GET USERS
// Used by Find People and group creation
// ==========================================
router.get("/", requireAuth, async (req, res) => {
  try {
    const search = String(req.query.search || "")
      .trim()
      .slice(0, 60);

    const filter = {
      _id: { $ne: req.user._id },
    };

    if (search) {
      const escaped = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      filter.$or = [
        { username: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select("_id username email role")
      .sort({ username: 1 })
      .limit(50)
      .lean();

    return res.json({
      users: users.map((user) => ({
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role || "member",
      })),
    });
  } catch (error) {
    console.error("Users error:", error);

    return res.status(500).json({
      message: "Could not load users.",
    });
  }
});

// ==========================================
// REGISTER FIREBASE DEVICE TOKEN
// ==========================================
router.post("/fcm-token", requireAuth, async (req, res) => {
  try {
    const { token, platform = "android" } = req.body;

    if (
      typeof token !== "string" ||
      !token.trim() ||
      token.length > 4096
    ) {
      return res.status(400).json({
        message: "A valid Firebase device token is required.",
      });
    }

    if (!["android", "ios", "web"].includes(platform)) {
      return res.status(400).json({
        message: "Invalid device platform.",
      });
    }

    const userId = req.user._id;
    const cleanToken = token.trim();

    // Remove this device token from other accounts.
    await User.updateMany(
      {
        _id: { $ne: userId },
        "fcmTokens.token": cleanToken,
      },
      {
        $pull: {
          fcmTokens: { token: cleanToken },
        },
      }
    );

    // Remove duplicate token from current account.
    await User.updateOne(
      { _id: userId },
      {
        $pull: {
          fcmTokens: { token: cleanToken },
        },
      }
    );

    // Register device under authenticated user.
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $push: {
          fcmTokens: {
            token: cleanToken,
            platform,
            updatedAt: new Date(),
          },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("_id");

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    return res.json({
      message: "Device registered successfully.",
    });
  } catch (error) {
    console.error("FCM registration error:", error);

    return res.status(500).json({
      message: "Could not register device.",
    });
  }
});

// ==========================================
// REMOVE FIREBASE DEVICE TOKEN
// ==========================================
router.delete("/fcm-token", requireAuth, async (req, res) => {
  try {
    const { token } = req.body;

    if (
      typeof token !== "string" ||
      !token.trim() ||
      token.length > 4096
    ) {
      return res.status(400).json({
        message: "A valid Firebase device token is required.",
      });
    }

    await User.updateOne(
      { _id: req.user._id },
      {
        $pull: {
          fcmTokens: {
            token: token.trim(),
          },
        },
      }
    );

    return res.json({
      message: "Device token removed successfully.",
    });
  } catch (error) {
    console.error("FCM removal error:", error);

    return res.status(500).json({
      message: "Could not remove device token.",
    });
  }
});

// ==========================================
// UPDATE MY ACTIVE STATUS VISIBILITY
// ==========================================
router.patch("/active-status", requireAuth, async (req, res) => {
  try {
    const { showActiveStatus } = req.body;

    if (typeof showActiveStatus !== "boolean") {
      return res.status(400).json({
        message: "Active status visibility must be true or false.",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: { showActiveStatus },
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("_id showActiveStatus");

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    return res.json({
      message: "Active status visibility updated.",
      showActiveStatus: user.showActiveStatus,
    });
  } catch (error) {
    console.error("Update active status error:", error);

    return res.status(500).json({
      message: "Could not update active status.",
    });
  }
});

export default router;
