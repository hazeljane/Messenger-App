
import { useEffect } from "react";
import { api } from "../api.js";
import { sameId } from "../utils/chatHelpers.js";

export default function useConversationSettings({
  user,
  activeChat,
  setChats,
  socket,
}) {
  // Load saved background when opening a conversation.
  useEffect(() => {
    const userId = user?._id || user?.id;
    const chatId = activeChat?.id || activeChat?._id;
    const isGroup = Boolean(activeChat?.isGroup);

    if (!userId || !chatId || !activeChat) return;

    if (
      !isGroup &&
      activeChat.conversationStatus !== "accepted"
    ) {
      return;
    }

    let cancelled = false;

    async function loadConversationSettings() {
      try {
        const settings = await api.getConversationSettings(
          chatId,
          { isGroup }
        );

        if (cancelled) return;

        const savedBackground =
          settings?.background || "default";

        setChats((previous) =>
          previous.map((chat) => {
            const currentChatId = chat.id || chat._id;

            if (
              sameId(currentChatId, chatId) &&
              Boolean(chat.isGroup) === isGroup
            ) {
              return {
                ...chat,
                background: savedBackground,
              };
            }

            return chat;
          })
        );
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Could not load conversation settings:",
            error
          );
        }
      }
    }

    loadConversationSettings();

    return () => {
      cancelled = true;
    };
  }, [
    user?._id,
    user?.id,
    activeChat?.id,
    activeChat?._id,
    activeChat?.isGroup,
    activeChat?.conversationStatus,
    setChats,
  ]);

  // Listen for background changes from either participant.
  useEffect(() => {
    if (!socket || !user) return;

    const currentUserId = String(user._id || user.id);

    function handleBackgroundUpdated(update) {
      if (!update?.participantIds || !update?.background) {
        return;
      }

      const participants = update.participantIds.map(String);

      // Make sure this user belongs to the conversation.
      if (!participants.includes(currentUserId)) {
        return;
      }

      // Find the other participant.
      const otherUserId = participants.find(
        (id) => id !== currentUserId
      );

      if (!otherUserId) return;

      setChats((previous) =>
        previous.map((chat) => {
          if (chat.isGroup) return chat;

          const chatId = String(chat.id || chat._id || "");

          // Match the private conversation by the other user's ID.
          if (
            chatId === otherUserId ||
            chat.conversationKey === update.conversationKey
          ) {
            return {
              ...chat,
              background: update.background,
            };
          }

          return chat;
        })
      );
    }

    socket.on(
      "conversation:background:updated",
      handleBackgroundUpdated
    );

    return () => {
      socket.off(
        "conversation:background:updated",
        handleBackgroundUpdated
      );
    };
  }, [socket, user?._id, user?.id, setChats]);
}
