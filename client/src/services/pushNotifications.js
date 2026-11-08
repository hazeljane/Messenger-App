
import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor, registerPlugin } from "@capacitor/core";
const IncomingCallBridge = registerPlugin("IncomingCallBridge");

import { api } from "../api";

// ==========================================
// STATE
// ==========================================

let listenersInitialized = false;
let initializationPromise = null;

let activeUserId = null;
let currentFcmToken = null;
let registeredTokenKey = null;

let channelCreated = false;
let notificationTapHandler = null;
let pendingNotificationTap = null;

let sessionGeneration = 0;

const registrationTasks = new Map();

// ==========================================
// NOTIFICATION TAP HANDLING
// ==========================================

const deliverNotificationTap = (data) => {
  if (!data || typeof data !== "object") return;

  if (!notificationTapHandler) {
    pendingNotificationTap = data;
    return;
  }

  try {
    notificationTapHandler(data);
  } catch (error) {
    console.error("Notification tap error:", error);
  }
};
export const clearPendingIncomingCallAction = async () => {
  if (Capacitor.getPlatform() !== "android") return;

  await IncomingCallBridge.clearPendingAction();
};

export const setNotificationTapHandler = (handler) => {
  notificationTapHandler =
    typeof handler === "function" ? handler : null;

  if (notificationTapHandler && pendingNotificationTap) {
    const pending = pendingNotificationTap;
    pendingNotificationTap = null;
    deliverNotificationTap(pending);
  }
};
// ==========================================
// ANDROID INCOMING CALL BRIDGE
// ==========================================

const handleNativeIncomingCallAction = (event) => {
  try {
    let data = event?.detail;

    // MainActivity sends the event data as a JSON string.
    if (typeof data === "string") {
      data = JSON.parse(data);
    }

    if (!data || typeof data !== "object") return;

    const action = data.action || data.callAction;

    if (!data.callId || !action) {
      console.warn("Invalid Android incoming call action.");
      return;
    }

    deliverNotificationTap({
      ...data,
      type: "incoming_call",
      action,
    });
  } catch (error) {
    console.error(
      "Android incoming call action error:",
      error
    );
  }
};
// ==========================================
// REGISTER TOKEN WITH BACKEND
// ==========================================

const registerTokenForActiveUser = async () => {
  const userId = activeUserId;
  const token = currentFcmToken;

  if (!userId || !token) return;

  const key = `${userId}:${token}`;

  if (registeredTokenKey === key) return;

  if (registrationTasks.has(key)) {
    return registrationTasks.get(key);
  }

  const task = (async () => {
    await api.registerFcmToken(
      token,
      Capacitor.getPlatform()
    );

    if (
      activeUserId === userId &&
      currentFcmToken === token
    ) {
      registeredTokenKey = key;
    }

    console.log("FCM token registered successfully.");
  })();

  registrationTasks.set(key, task);

  try {
    await task;
  } catch (error) {
    console.error(
      "FCM registration failed:",
      error.message
    );

    throw error;
  } finally {
    if (registrationTasks.get(key) === task) {
      registrationTasks.delete(key);
    }
  }
};

// ==========================================
// INITIALIZE LISTENERS ONCE
// ==========================================

export const initializePushNotifications = async () => {
  if (!Capacitor.isNativePlatform()) return;

  if (listenersInitialized) return;

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      await PushNotifications.addListener(
        "registration",
        async ({ value }) => {
          if (!value) return;

          if (currentFcmToken !== value) {
            currentFcmToken = value;
            registeredTokenKey = null;
          }

          console.log("FCM token received.");

          try {
            await registerTokenForActiveUser();
          } catch (error) {
            console.error(
              "Could not save FCM token:",
              error.message
            );
          }
        }
      );
// Listen for native Android incoming-call actions.
if (Capacitor.getPlatform() === "android") {
  window.addEventListener(
    "chatterboxIncomingCallAction",
    handleNativeIncomingCallAction
  );

  // Recover an action saved before JavaScript was ready.
  try {
    const pendingAction =
      await IncomingCallBridge.getPendingAction();

    if (
      pendingAction?.callId &&
      pendingAction?.action
    ) {
      deliverNotificationTap({
        ...pendingAction,
        type: "incoming_call",
      });
    }
  } catch (error) {
    console.error(
      "Could not recover pending Android call action:",
      error
    );
  }
}
      await PushNotifications.addListener(
        "registrationError",
        (error) => {
          console.error("FCM registration error:", error);
        }
      );

      await PushNotifications.addListener(
        "pushNotificationReceived",
        (notification) => {
          console.log(
            "Foreground notification:",
            notification.title
          );
        }
      );

      await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          deliverNotificationTap(
            action.notification?.data || {}
          );
        }
      );

      listenersInitialized = true;

      console.log("Push listeners initialized.");
    } catch (error) {
      console.error("Listener initialization failed:", error);
      throw error;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
};

// ==========================================
// ANDROID NOTIFICATION CHANNEL
// ==========================================

const createNotificationChannel = async () => {
  if (
    Capacitor.getPlatform() !== "android" ||
    channelCreated
  ) {
    return;
  }

  await PushNotifications.createChannel({
    id: "messages",
    name: "Messages",
    description: "Chatterbox incoming messages",
    importance: 5,
    visibility: 1,
    sound: "default",
    vibration: true,
  });

  channelCreated = true;

  console.log("Notification channel created.");
};

// ==========================================
// REGISTER FOR AUTHENTICATED USER
// ==========================================

export const registerPushNotifications = async (userId) => {
  if (!Capacitor.isNativePlatform() || !userId) return;

  const requestedUserId = String(userId);

  if (activeUserId !== requestedUserId) {
    activeUserId = requestedUserId;
    registeredTokenKey = null;
  }

  const generation = ++sessionGeneration;

  try {
    await initializePushNotifications();

    if (
      generation !== sessionGeneration ||
      activeUserId !== requestedUserId
    ) return;

    let permission =
      await PushNotifications.checkPermissions();

    if (permission.receive !== "granted") {
      permission =
        await PushNotifications.requestPermissions();
    }

    if (
      generation !== sessionGeneration ||
      activeUserId !== requestedUserId
    ) return;

    if (permission.receive !== "granted") {
      console.log("Notification permission denied.");
      return;
    }

    await createNotificationChannel();

    if (
      generation !== sessionGeneration ||
      activeUserId !== requestedUserId
    ) return;

    // Register the cached token first, if available.
    await registerTokenForActiveUser();

    if (
      generation !== sessionGeneration ||
      activeUserId !== requestedUserId
    ) return;

    // Ask the native plugin for the current FCM token.
    await PushNotifications.register();

    console.log("FCM registration requested.");
  } catch (error) {
    console.error(
      "Push registration failed:",
      error.message
    );

    throw error;
  }
};

// ==========================================
// LOGOUT
// ==========================================

export const unregisterPushNotifications = async () => {
  const userId = activeUserId;
  const token = currentFcmToken;

  activeUserId = null;
  sessionGeneration++;
  registeredTokenKey = null;

  if (!userId || !token) {
    console.log("No active FCM token to remove.");
    return;
  }

  const key = `${userId}:${token}`;

  try {
    const pending = registrationTasks.get(key);

    if (pending) {
      await Promise.allSettled([pending]);
    }

    await api.removeFcmToken(token);

    console.log("FCM token removed successfully.");
  } catch (error) {
    console.error(
      "FCM token removal failed:",
      error.message
    );

    throw error;
  }
};
