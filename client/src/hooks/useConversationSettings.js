
import { useEffect } from "react";
import { api } from "../api.js";
import { sameId } from "../utils/chatHelpers.js";

export default function useConversationSettings({
  user,
  activeChat,
  setChats,
}) {
  useEffect(() => {
    console.log("CONVERSATION SETTINGS CHECK:", {
      userId: user?._id || user?.id,
      activeChatId: activeChat?.id,
      isGroup: activeChat?.isGroup,
      status: activeChat?.conversationStatus,
    });

    if (
      !user ||
      !activeChat ||
      activeChat.isGroup ||
      activeChat.conversationStatus !== "accepted"
    ) {
      console.log("Background loading skipped.");
      return;
    }

    let cancelled = false;
    const chatId = activeChat.id;

    async function loadConversationSettings() {
      try {
        console.log("Loading background for:", chatId);

        const settings = await api.getConversationSettings(chatId);

        if (cancelled) return;

        const savedBackground =
          settings?.background || "default";

        console.log("DATABASE BACKGROUND:", savedBackground);

        setChats((previous) =>
          previous.map((chat) =>
            sameId(chat.id, chatId)
              ? {
                  ...chat,
                  background: savedBackground,
                }
              : chat
          )
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Could not load conversation settings:", error);
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
    activeChat?.isGroup,
    activeChat?.conversationStatus,
    setChats,
  ]);
}
