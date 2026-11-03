
import mongoose from "mongoose";

const conversationSettingsSchema = new mongoose.Schema(
  {
    conversationKey: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    background: {
      type: String,
      enum: [
        "default",
        "lavender",
        "ocean",
        "sunset",
        "forest",
        "rose",
        "mint",
        "peach",
        "night",
        "sky",
      ],
      default: "default",
    },
  },
  { timestamps: true }
);

conversationSettingsSchema.index(
  { conversationKey: 1, userId: 1 },
  { unique: true }
);

export default mongoose.model(
  "ConversationSettings",
  conversationSettingsSchema
);
