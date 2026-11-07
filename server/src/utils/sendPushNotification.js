
import { firebaseMessaging } from "../firebase.js";
import User from "../models/User.js";

// ==========================================
// INVALID FCM TOKEN CODES
// ==========================================

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

// ==========================================
// RESERVED FCM DATA KEYS
// ==========================================

const RESERVED_DATA_KEYS = [
  /^from$/i,
  /^message_type$/i,
  /^google\./i,
  /^gcm\./i,
];

// ==========================================
// SEND PUSH NOTIFICATION
// ==========================================

export async function sendPushNotification(
  user,
  { title, body, data = {} } = {}
) {
  try {
    // ========================================
    // VALIDATE USER
    // ========================================

    if (!user?._id) {
      return {
        success: false,
        reason: "invalid-user",
      };
    }

    // ========================================
    // VALIDATE NOTIFICATION CONTENT
    // ========================================

    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof body !== "string" ||
      !body.trim()
    ) {
      return {
        success: false,
        reason: "invalid-payload",
      };
    }

    // ========================================
    // CHECK FIREBASE
    // ========================================

    if (!firebaseMessaging) {
      console.error(
        "Firebase Messaging is not initialized."
      );

      return {
        success: false,
        reason: "firebase-not-initialized",
      };
    }

    // ========================================
    // COLLECT UNIQUE DEVICE TOKENS
    // ========================================

    const tokens = [
      ...new Set(
        (Array.isArray(user.fcmTokens) ? user.fcmTokens : [])
          .map((item) =>
            typeof item?.token === "string"
              ? item.token.trim()
              : ""
          )
          .filter(Boolean)
      ),
    ];

    if (!tokens.length) {
      console.log(
        "No FCM tokens for user:",
        user._id.toString()
      );

      return {
        success: false,
        reason: "no-tokens",
      };
    }

    // ========================================
    // VALIDATE FCM DATA
    // ========================================

    const safeData =
      data &&
      typeof data === "object" &&
      !Array.isArray(data)
        ? data
        : {};

    const notificationData = Object.fromEntries(
      Object.entries(safeData)
        .filter(
          ([key]) =>
            key &&
            !RESERVED_DATA_KEYS.some((pattern) =>
              pattern.test(key)
            )
        )
        .map(([key, value]) => [
          key,
          String(value ?? ""),
        ])
    );

    // ========================================
    // SEND NOTIFICATIONS
    // ========================================

    let successCount = 0;
    let failureCount = 0;

    // Firebase supports up to 500 tokens per batch.
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);

      const response =
        await firebaseMessaging.sendEachForMulticast({
          tokens: batch,

          notification: {
            title: title.trim(),
            body: body.trim(),
          },

          data: notificationData,

          android: {
            priority: "high",
            notification: {
              channelId: "messages",
              sound: "default",
              priority: "high",
            },
          },
        });

      successCount += response.successCount;
      failureCount += response.failureCount;

      // ======================================
      // FIND INVALID TOKENS
      // ======================================

      const invalidTokens = [];

      response.responses.forEach((result, index) => {
        if (result.success) {
          console.log(
            "FCM accepted notification for user:",
            user._id.toString()
          );
        } else {
          console.error("FCM delivery failed:", {
            code: result.error?.code,
            message: result.error?.message,
          });

          if (
            INVALID_TOKEN_CODES.has(result.error?.code)
          ) {
            invalidTokens.push(batch[index]);
          }
        }
      });

      // ======================================
      // REMOVE INVALID TOKENS
      // ======================================

      if (invalidTokens.length) {
        try {
          await User.updateOne(
            { _id: user._id },
            {
              $pull: {
                fcmTokens: {
                  token: { $in: invalidTokens },
                },
              },
            }
          );

          console.log(
            "Removed invalid FCM tokens:",
            invalidTokens.length
          );
        } catch (cleanupError) {
          console.error(
            "Could not remove invalid FCM tokens:",
            cleanupError
          );
        }
      }
    }

    // ========================================
    // FINAL RESULT
    // ========================================

    console.log("FCM notification summary:", {
      userId: user._id.toString(),
      successCount,
      failureCount,
    });

    return {
      success: successCount > 0,
      successCount,
      failureCount,
    };
  } catch (error) {
    console.error(
      "Push notification service error:",
      error
    );

    return {
      success: false,
      reason: "sending-error",
    };
  }
}
