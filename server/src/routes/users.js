
import { Router } from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// GET USERS
// Used by Find People and group creation
router.get("/", requireAuth, async (req, res) => {
  try {
    const search = String(req.query.search || "")
      .trim()
      .slice(0, 60);

    const filter = {
      _id: { $ne: req.user._id },
    };

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

    res.json({
      users: users.map((user) => ({
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role || "member",
      })),
    });
  } catch (error) {
    console.error("Users error:", error);

    res.status(500).json({
      message: "Could not load users.",
    });
  }
});
// UPDATE MY ACTIVE STATUS VISIBILITY
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
