
import { useEffect } from "react";
import { api } from "../api.js";
import { sameId } from "../utils/chatHelpers.js";

export default function useConversationSettings({
  activeChat,
  setChats,
}) {
  useEffect(() => {
    if (
      !activeChat ||
      activeChat.isGroup ||
      activeChat.conversationStatus !== "accepted"
    ) {
      return;
    }

    let cancelled = false;

    api.getConversationSettings(activeChat.id)
      .then(({ background }) => {
        if (cancelled) return;

        const savedBackground = background || "default";

        setChats((previous) =>
          previous.map((chat) => {
            if (!sameId(chat.id, activeChat.id)) {
              return chat;
            }

            if (chat.background === savedBackground) {
              return chat;
            }

            return {
              ...chat,
              background: savedBackground,
            };
          })
        );
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(
            "Could not load conversation settings:",
            err
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeChat?.id,
    activeChat?.isGroup,
    activeChat?.conversationStatus,
    setChats,
  ]);
}
