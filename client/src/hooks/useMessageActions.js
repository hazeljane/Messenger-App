
import { useCallback, useRef } from "react";
import { api } from "../api.js";

export default function useMessageActions({
  activeChat,
  draft,
  setDraft,
  replyTo,
  setReplyTo,
  inputRef,
  socketRef,
  showNotice,
  setError,
  setMentionSuccessToast,
  editDraft,
  setEditDraft,
  setEditingMessageId,
  setSavingEdit,
  savingEdit,
}) {
  // Keep the original message unchanged while editing.
  const originalMessageRef = useRef(null);

  // Reply to a message.
  const handleReply = useCallback((message) => {
    setReplyTo(message);
    inputRef.current?.focus();
  }, [setReplyTo, inputRef]);

  // Send private and group messages.
  const sendMessage = useCallback(async (event, selectedFile = null) => {
    event.preventDefault();

    const text = draft.trim();

    if ((!text && !selectedFile) || !activeChat) return;

    if (!socketRef.current?.connected) {
      setError("You're offline from the chat server. Reconnect and try again.");
      throw new Error("You're offline from the chat server.");
    }

    setError("");

    const isGroup = activeChat.isGroup;
    const groupName = activeChat.name || "your group";

    const mentions = isGroup
      ? [...new Set(text.match(/@[a-zA-Z0-9_.-]+/g) || [])]
      : [];

    const eventName = isGroup
      ? "group:message:send"
      : "message:send";

    try {
      let attachment = null;

      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const response = await api.uploadFile(formData);
        attachment = response.attachment;

        if (!attachment?.url) {
          throw new Error("The server did not return the uploaded file.");
        }
      }

      const replyMessageId = replyTo
        ? replyTo.id ?? replyTo._id ?? null
        : null;

      const payload = isGroup
        ? {
            groupId: activeChat.id,
            text,
            attachment,
            replyTo: replyMessageId,
          }
        : {
            recipientId: activeChat.id,
            text,
            attachment,
            replyTo: replyMessageId,
          };

      const result = await new Promise((resolve, reject) => {
        socketRef.current.timeout(5000).emit(
          eventName,
          payload,
          (timeoutError, response) => {
            if (timeoutError) {
              reject(new Error("The server did not respond. Please try again."));
              return;
            }

            if (!response?.ok) {
              reject(new Error(response?.message || "Message could not be sent."));
              return;
            }

            resolve(response);
          }
        );
      });

      setDraft("");
      setReplyTo(null);

      if (mentions.length > 0) {
        setMentionSuccessToast(
          `Message sent! You mentioned ${mentions.join(", ")} in ${groupName}.`
        );

        setTimeout(() => setMentionSuccessToast(""), 4000);
      }

      inputRef.current?.focus();

      return result;
    } catch (error) {
      setError(error.message || "Unable to send your message.");
      throw error;
    }
  }, [
    activeChat,
    draft,
    replyTo,
    socketRef,
    inputRef,
    setDraft,
    setReplyTo,
    setError,
    setMentionSuccessToast,
  ]);

  // Start editing.
  const startEditing = useCallback((message) => {
    if (!message || message.isDeleted) return;

    const messageId = message.id ?? message._id;

    if (!messageId) return;

    // Save an untouched copy of the original message.
    originalMessageRef.current = {
      ...message,
      attachment: message.attachment
        ? { ...message.attachment }
        : null,
    };

    setEditingMessageId(String(messageId));
    setEditDraft(message.text || "");
    setError("");
  }, [
    setEditingMessageId,
    setEditDraft,
    setError,
  ]);

  // Cancel editing and discard the draft.
  const cancelEditing = useCallback(() => {
    const original = originalMessageRef.current;

    // Restore the original text in the draft before closing.
    if (original) {
      setEditDraft(original.text || "");
    } else {
      setEditDraft("");
    }

    originalMessageRef.current = null;

    setEditingMessageId("");
    setSavingEdit(false);
  }, [
    setEditingMessageId,
    setEditDraft,
    setSavingEdit,
  ]);

  // Save edited message.
  const saveEditedMessage = useCallback((message) => {
    const text = editDraft.trim();
    const messageId = message?.id ?? message?._id;

    if (!messageId || savingEdit) return;

    // Never allow an empty edit to erase the original message.
    if (!text) {
      setError("A message cannot be completely empty.");
      return;
    }

    const currentSocket = socketRef.current;

    if (!currentSocket?.connected) {
      setError("You're offline. Please reconnect and try again.");
      return;
    }

    setSavingEdit(true);
    setError("");

    const eventName = activeChat?.isGroup
      ? "group:message:edit"
      : "message:edit";

    currentSocket.timeout(5000).emit(
      eventName,
      {
        messageId: String(messageId),
        text,
      },
      (timeoutError, result) => {
        if (timeoutError) {
          setSavingEdit(false);
          setError("The server did not respond. Please try again.");
          return;
        }

        if (!result?.ok) {
          setSavingEdit(false);
          setError(result?.message || "Message could not be edited.");
          return;
        }

        originalMessageRef.current = null;

        setSavingEdit(false);
        setEditingMessageId("");
        setEditDraft("");

        showNotice("Message updated successfully.");
      }
    );
  }, [
    editDraft,
    savingEdit,
    socketRef,
    activeChat,
    setError,
    setSavingEdit,
    setEditingMessageId,
    setEditDraft,
    showNotice,
  ]);

  // Delete private and group messages.
  const handleDeleteMessage = useCallback((message, deleteType) => {
    const currentSocket = socketRef.current;

    if (!currentSocket?.connected) {
      setError("You're offline. Please reconnect and try again.");
      return;
    }

    const messageId = message.id ?? message._id;

    if (!messageId || !activeChat) {
      setError("Message could not be identified.");
      return;
    }

    const eventName = activeChat.isGroup
      ? "group:message:delete"
      : "message:delete";

    setError("");

    currentSocket.timeout(5000).emit(
      eventName,
      { messageId, deleteType },
      (timeoutError, result) => {
        if (timeoutError) {
          setError("The server did not respond. Please try again.");
          return;
        }

        if (!result?.ok) {
          setError(result?.message || "Unable to delete message.");
          return;
        }

        showNotice(
          deleteType === "deleteForEveryone"
            ? "Message deleted for everyone."
            : "Message deleted for you."
        );
      }
    );
  }, [activeChat, socketRef, setError, showNotice]);

  // Remove an image attachment from a group message.
  const removeImage = useCallback((messageId) => {
    const confirmed = window.confirm(
      "Are you sure you want to remove this image?"
    );

    if (!confirmed) return;

    const currentSocket = socketRef.current;

    if (!currentSocket?.connected) {
      setError("You're offline. Please reconnect and try again.");
      return;
    }

    setError("");

    currentSocket.timeout(5000).emit(
      "group:message:remove-attachment",
      { messageId },
      (timeoutError, result) => {
        if (timeoutError) {
          setError("The server did not respond. Please try again.");
          return;
        }

        if (!result?.ok) {
          setError(result?.message || "Unable to remove image.");
        }
      }
    );
  }, [socketRef, setError]);

  return {
    sendMessage,
    handleReply,
    handleDeleteMessage,
    startEditing,
    cancelEditing,
    saveEditedMessage,
    removeImage,
  };
}
