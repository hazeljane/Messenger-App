import { useEffect } from "react";

export default function useChatSocket({
  socket,
  setSocketStatus,
  setError,
  setMentionToast,
}) {
  useEffect(() => {
    if (!socket) return;

    // =====================================
    // CONNECTION EVENTS
    // =====================================

    function handleConnect() {
      console.log("Socket connected");

      setSocketStatus("connected");
      setError("");
    }

    function handleDisconnect(reason) {
      console.log("Socket disconnected:", reason);

      setSocketStatus("disconnected");
    }

    function handleConnectError(error) {
      console.error("Socket connection error:", error);

      setSocketStatus("disconnected");

      setError(
        error.message === "Authentication required" ||
        error.message === "Invalid session"
          ? "Your chat connection needs a fresh login. Please sign in again."
          : "Cannot connect to chat server."
      );
    }

    // =====================================
    // MENTION NOTIFICATIONS
    // =====================================

    function handleMentionNotification(notification) {
      console.log("Mention notification:", notification);

      setMentionToast({
        senderName: notification.senderName,
        groupName: notification.groupName,
        notification,
      });
    }

    // =====================================
    // CALL EVENTS
    // =====================================

    function handleMissedCall({ callId } = {}) {
      console.log("Call was not answered:", callId);
    }

    function handleCallEnded({ callId } = {}) {
      console.log("Call ended:", callId);
    }

    // =====================================
    // REGISTER SOCKET LISTENERS
    // =====================================

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    socket.on(
      "mention:notification",
      handleMentionNotification
    );

    socket.on("call:missed", handleMissedCall);
    socket.on("call:ended", handleCallEnded);

    // =====================================
    // CHECK CURRENT CONNECTION
    // =====================================

    if (socket.connected) {
      handleConnect();
    }

    // =====================================
    // CLEANUP LISTENERS
    // =====================================

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);

      socket.off(
        "mention:notification",
        handleMentionNotification
      );

      socket.off("call:missed", handleMissedCall);
      socket.off("call:ended", handleCallEnded);
    };
  }, [
    socket,
    setSocketStatus,
    setError,
    setMentionToast,
  ]);
}