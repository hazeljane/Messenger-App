
import "./ChatHeader.css";
import { useState } from "react";
import {
  ArrowLeft,
  MoreHorizontal,
  Phone,
  Video,
  Palette,
  Trash2,
  Mail,
} from "lucide-react";

import Avatar from "./Avatar.jsx";

export default function ChatHeader({
  activeChat,
  onlineIds,
  setMobileChatOpen,
  showNotice,
  handleDeleteGroup,
  onOpenBackgroundPicker,
  onStartCall,
  callStatus,
  messageRequestCount = 0,
  setShowMessageRequests,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!activeChat) return null;

  const isGroup = Boolean(activeChat.isGroup);
  const isOnline =
    onlineIds?.has(String(activeChat.id)) ?? false;

  // =========================
  // CHANGE CHAT BACKGROUND
  // =========================

  const handleBackgroundClick = () => {
    setMenuOpen(false);
    onOpenBackgroundPicker?.(activeChat);
  };

  // =========================
  // DELETE GROUP
  // =========================

  const handleDeleteClick = () => {
    setMenuOpen(false);
    handleDeleteGroup?.(activeChat);
  };

  // =========================
  // START VOICE OR VIDEO CALL
  // =========================

  const handleCallClick = (callType) => {
    if (isGroup) {
      showNotice("Calls are only available for private conversations.");
      return;
    }

    if (!isOnline) {
      showNotice("This user is currently offline.");
      return;
    }

    if (!onStartCall) {
      showNotice("Calling is not connected yet.");
      return;
    }

    onStartCall(activeChat, callType);
  };

  // =========================
  // MESSAGE REQUESTS
  // =========================

  const handleMessageRequestsClick = () => {
    setShowMessageRequests?.(true);
  };

  return (
    <header className="chat-header">
      <button
        className="icon-button mobile-back"
        aria-label="Back to people"
        onClick={() => setMobileChatOpen(false)}
      >
        <ArrowLeft size={20} />
      </button>

      <Avatar
        name={activeChat.username || activeChat.name}
        online={!isGroup && isOnline}
        small
      />

      <div className="chat-header-copy">
        <h2>
          {isGroup
            ? activeChat.name
            : activeChat.username || activeChat.name}
        </h2>

        <p>
          {isGroup
            ? `${activeChat.members?.length || 0} members`
            : isOnline
              ? <><i /> Online now</>
              : "Messages are private to this conversation"}
        </p>
      </div>

      <div className="header-actions">
        {/* MESSAGE REQUESTS */}
        <button
          className="icon-button message-requests-button"
          aria-label={`Message requests${
            messageRequestCount > 0
              ? `, ${messageRequestCount} pending`
              : ""
          }`}
          title="Message requests"
          onClick={handleMessageRequestsClick}
        >
          <Mail size={19} />

          {messageRequestCount > 0 && (
            <span className="request-count">
              {messageRequestCount > 99
                ? "99+"
                : messageRequestCount}
            </span>
          )}
        </button>

        {/* VOICE AND VIDEO CALLS */}
        {!isGroup && (
          <>
            <button
              className="icon-button"
              aria-label="Voice call"
              title="Voice call"
              disabled={!isOnline || Boolean(callStatus)}
              onClick={() => handleCallClick("audio")}
            >
              <Phone size={19} />
            </button>

            <button
              className="icon-button"
              aria-label="Video call"
              title="Video call"
              disabled={!isOnline || Boolean(callStatus)}
              onClick={() => handleCallClick("video")}
            >
              <Video size={20} />
            </button>
          </>
        )}

        <span className="action-divider" />

        {/* CONVERSATION OPTIONS */}
        <div className="chat-options">
          <button
            className="icon-button"
            aria-label="Conversation options"
            aria-expanded={menuOpen}
            onClick={() =>
              setMenuOpen((previous) => !previous)
            }
          >
            <MoreHorizontal size={21} />
          </button>

          {menuOpen && (
            <div className="chat-options-menu">
              <button onClick={handleBackgroundClick}>
                <Palette size={17} />
                <span>Change background</span>
              </button>

              {isGroup && (
                <button
                  className="danger-option"
                  onClick={handleDeleteClick}
                >
                  <Trash2 size={17} />
                  <span>Delete group</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
