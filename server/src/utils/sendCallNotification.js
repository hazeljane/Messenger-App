
import { firebaseMessaging } from "../firebase.js";
import User from "../models/User.js";

const CALL_NOTIFICATION_TTL = 45_000;

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

export async function sendCallNotification(
  recipient,
  {
    callId,
    callerId,
    callerName,
    callType,
    expiresAt,
  } = {}
) {
  try {
    if (!recipient?._id) {
      return {
        success: false,
        reason: "invalid-recipient",
      };
    }

    if (!firebaseMessaging) {
      console.error(
        "Firebase Messaging is not initialized."
      );

      return {
        success: false,
        reason: "firebase-not-initialized",
      };
    }

    if (
      !callId ||
      !callerId ||
      !["audio", "video"].includes(callType)
    ) {
      return {
        success: false,
        reason: "invalid-call-data",
      };
    }

    // Only send incoming-call notifications to Android devices.
    const tokens = [
      ...new Set(
        (Array.isArray(recipient.fcmTokens)
          ? recipient.fcmTokens
          : []
        )
          .filter((item) => item?.platform === "android")
          .map((item) =>
            typeof item.token === "string"
              ? item.token.trim()
              : ""
          )
          .filter(Boolean)
      ),
    ];

    if (!tokens.length) {
      console.log(
        "No Android FCM tokens for recipient:",
        recipient._id.toString()
      );

      return {
        success: false,
        reason: "no-android-tokens",
      };
    }

    const expiration = expiresAt
      ? new Date(expiresAt).getTime()
      : Date.now() + CALL_NOTIFICATION_TTL;

    const remainingTtl = Math.min(
      CALL_NOTIFICATION_TTL,
      expiration - Date.now()
    );

    if (remainingTtl <= 0) {
      return {
        success: false,
        reason: "call-expired",
      };
    }

    const data = {
      type: "incoming_call",
      callId: String(callId),
      callerId: String(callerId),
      callerName: String(callerName || "Chatterbox user"),
      callType: String(callType),
      expiresAt: new Date(expiration).toISOString(),
    };

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);

      const response =
        await firebaseMessaging.sendEachForMulticast({
          tokens: batch,

          // Intentionally no notification property.
          // Android will display the call notification natively.
          data,

          android: {
            priority: "high",
            ttl: Math.floor(remainingTtl),
            collapseKey: `call-${callId}`,
          },
        });

      successCount += response.successCount;
      failureCount += response.failureCount;

      const invalidTokens = [];

      response.responses.forEach((result, index) => {
        if (result.success) {
          console.log(
            "Incoming-call FCM accepted:",
            callId
          );
        } else {
          console.error("Incoming-call FCM failed:", {
            code: result.error?.code,
            message: result.error?.message,
          });

          if (INVALID_TOKEN_CODES.has(result.error?.code)) {
            invalidTokens.push(batch[index]);
          }
        }
      });

      if (invalidTokens.length) {
        try {
          await User.updateOne(
            { _id: recipient._id },
            {
              $pull: {
                fcmTokens: {
                  token: { $in: invalidTokens },
                },
              },
            }
          );
        } catch (error) {
          console.error(
            "Could not remove invalid call FCM tokens:",
            error
          );
        }
      }
    }

    console.log("Incoming-call notification summary:", {
      callId,
      recipientId: recipient._id.toString(),
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
      "Incoming-call notification error:",
      error
    );

    return {
      success: false,
      reason: "sending-error",
    };
  }
}
