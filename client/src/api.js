
import { io } from "socket.io-client";

// =========================
// API CONFIGURATION
// =========================

export const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/$/, "");

// =========================
// API REQUEST HELPER
// =========================

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
  // Account settings
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

  // Private conversation settings
  getConversationSettings: (userId) =>
    request(
      `/api/conversations/${encodeURIComponent(userId)}/settings`
    ),

  updateConversationBackground: (userId, background) =>
    request(
      `/api/conversations/${encodeURIComponent(userId)}/settings`,
      {
        method: "PATCH",
        body: JSON.stringify({ background }),
      }
    ),

  // Group conversation settings
  updateGroupBackground: (groupId, background) =>
    request(
      `/api/groups/${encodeURIComponent(groupId)}/background`,
      {
        method: "PATCH",
        body: JSON.stringify({ background }),
      }
    ),

  // Authentication
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

  // Users and private messages
  users: (search = "") =>
    request(`/api/users?search=${encodeURIComponent(search)}`),

  messages: (userId) =>
    request(`/api/messages/${encodeURIComponent(userId)}`),

  // Private message requests
  getMessageRequests: () =>
    request("/api/conversations/requests"),

  acceptMessageRequest: (userId) =>
    request(`/api/conversations/${encodeURIComponent(userId)}/accept`, {
      method: "POST",
    }),

  rejectMessageRequest: (userId) =>
    request(`/api/conversations/${encodeURIComponent(userId)}/reject`, {
      method: "POST",
    }),

  deleteMessageRequest: (userId) =>
    request(`/api/conversations/${encodeURIComponent(userId)}/request`, {
      method: "DELETE",
    }),

  blockConversation: (userId) =>
    request(`/api/conversations/${encodeURIComponent(userId)}/block`, {
      method: "POST",
    }),

  // Group chats
  groups: () => request("/api/groups"),

  createGroup: (payload) =>
    request("/api/groups", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  addGroupMembers: (groupId, memberIds) =>
    request(`/api/groups/${encodeURIComponent(groupId)}/members`, {
      method: "PATCH",
      body: JSON.stringify({ memberIds }),
    }),

  deleteGroup: (groupId) =>
    request(`/api/groups/${encodeURIComponent(groupId)}`, {
      method: "DELETE",
    }),

  groupMessages: (groupId) =>
    request(`/api/groups/${encodeURIComponent(groupId)}/messages`),

  // File attachments
  uploadFile: async (formData) => {
    const response = await fetch(`${API_URL}/api/uploads`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "File upload failed.");
    }

    return data;
  },
};

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
  console.error("Socket.IO connection error:", error.message);
  console.error("Error details:", error);
});

  socket.on("disconnect", (reason) => {
    console.log("Socket.IO disconnected:", reason);
  });

  return socket;
}
