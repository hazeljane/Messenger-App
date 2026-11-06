import { io } from "socket.io-client";

  export const API_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:5000"
  ).replace(/\/+$/, "");

console.log("API BASE URL:", API_URL);

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.headers || {}),
      "Content-Type": "application/json",
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("API request failed:", {
      url: `${API_URL}${path}`,
      method: options.method || "GET",
      status: response.status,
      response: data,
    });

    throw new Error(
      data.message || `Request failed with status ${response.status}`
    );
  }

  return data;
}

// =========================
// API METHODS
// =========================

export const api = {
  // =========================
  // ACCOUNT SETTINGS
  // =========================

  updateTheme: (theme) =>
    request("/api/settings/theme", {
      method: "PATCH",
      body: JSON.stringify({ theme }),
    }),

  updateActiveStatus: (showActiveStatus) =>
    request("/api/users/active-status", {
      method: "PATCH",
      body: JSON.stringify({ showActiveStatus }),
    }),

  // =========================
  // PRIVATE CONVERSATION SETTINGS
  // =========================

  getConversationSettings: (id, { isGroup = false } = {}) =>
    isGroup
      ? request(
          `/api/groups/${encodeURIComponent(id)}/background`
        )
      : request(
          `/api/conversations/${encodeURIComponent(id)}/settings`
        ),

  updateConversationBackground: (userId, background) =>
    request(
      `/api/conversations/${encodeURIComponent(userId)}/settings`,
      {
        method: "PATCH",
        body: JSON.stringify({ background }),
      }
    ),

  // =========================
  // GROUP CONVERSATION SETTINGS
  // =========================

  updateGroupBackground: (groupId, background) =>
    request(
      `/api/groups/${encodeURIComponent(groupId)}/background`,
      {
        method: "PATCH",
        body: JSON.stringify({ background }),
      }
    ),

  // =========================
  // AUTHENTICATION
  // =========================

  me: () => request("/api/auth/me"),

  signup: (payload) =>
    request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  login: (payload) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  logout: () =>
    request("/api/auth/logout", {
      method: "POST",
    }),

  // =========================
  // USERS
  // =========================

  users: (search = "") =>
    request(
      `/api/users?search=${encodeURIComponent(search)}`
    ),

  // =========================
  // FIREBASE DEVICE REGISTRATION
  // =========================

  registerFcmToken: (token, platform = "android") =>
    request("/api/users/fcm-token", {
      method: "POST",
      body: JSON.stringify({ token, platform }),
    }),

  removeFcmToken: (token) =>
    request("/api/users/fcm-token", {
      method: "DELETE",
      body: JSON.stringify({ token }),
    }),

  // =========================
  // PRIVATE MESSAGES
  // =========================

  messages: (userId) =>
    request(
      `/api/messages/${encodeURIComponent(userId)}`
    ),

  // =========================
  // PRIVATE MESSAGE REQUESTS
  // =========================

  getMessageRequests: () =>
    request("/api/conversations/requests"),

  acceptMessageRequest: (userId) =>
    request(
      `/api/conversations/${encodeURIComponent(userId)}/accept`,
      {
        method: "POST",
      }
    ),

  rejectMessageRequest: (userId) =>
    request(
      `/api/conversations/${encodeURIComponent(userId)}/reject`,
      {
        method: "POST",
      }
    ),

  deleteMessageRequest: (userId) =>
    request(
      `/api/conversations/${encodeURIComponent(userId)}/request`,
      {
        method: "DELETE",
      }
    ),

  blockConversation: (userId) =>
    request(
      `/api/conversations/${encodeURIComponent(userId)}/block`,
      {
        method: "POST",
      }
    ),

  // =========================
  // GROUP CHATS
  // =========================

  groups: () =>
    request("/api/groups"),

  createGroup: (payload) =>
    request("/api/groups", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  addGroupMembers: (groupId, memberIds) =>
    request(
      `/api/groups/${encodeURIComponent(groupId)}/members`,
      {
        method: "PATCH",
        body: JSON.stringify({ memberIds }),
      }
    ),

  deleteGroup: (groupId) =>
    request(
      `/api/groups/${encodeURIComponent(groupId)}`,
      {
        method: "DELETE",
      }
    ),

  groupMessages: (groupId) =>
    request(
      `/api/groups/${encodeURIComponent(groupId)}/messages`
    ),

  // =========================
  // FILE ATTACHMENTS
  // =========================

  uploadFile: async (formData) => {
    const response = await fetch(`${API_URL}/api/uploads`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.message || "File upload failed."
      );
    }

    return data;
  },
};

// =========================
// SOCKET.IO CONNECTION
// =========================

export function connectSocket() {
  const socket = io(API_URL, {
    withCredentials: true,
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    console.log("Socket.IO connected:", socket.id);
  });

  socket.on("connect_error", (error) => {
    console.error(
      "Socket.IO connection error:",
      error.message
    );

    console.error("Error details:", error);
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket.IO disconnected:", reason);
  });

  return socket;
}
