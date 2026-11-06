import "dotenv/config";
import { firebaseMessaging } from "./src/firebase.js";

async function testNotification() {
  try {
    const token = process.env.FCM_DEVICE_TOKEN;

    if (!token) {
      throw new Error("FCM_DEVICE_TOKEN is missing from .env");
    }

    const messageId = await firebaseMessaging.send({
      token,
      notification: {
        title: "Chatterbox Test",
        body: "Hello! Firebase push notifications are working!",
      },
    });

    console.log("SUCCESS! Notification sent:", messageId);
  } catch (error) {
    console.error("FCM ERROR:", error.code);
    console.error(error.message);
  }
}

testNotification();