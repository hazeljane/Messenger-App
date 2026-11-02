import {
  MessageCircle,
  Search,
  Plus,
  MoreHorizontal,
  Settings,
  Users,
  Bell,
  LogOut,
  Mail,
} from "lucide-react";
import "./ChatSidebar.css";
import Avatar, { initials, colorFor } from "./Avatar.jsx";
import { getTime, sameId } from "../utils/chatHelpers.js";

export default function ChatSidebar({
  user,
  chats,
  activeId,
  search,
  setSearch,
  filteredChats,
  chatFilter,
  setChatFilter,
  onlineIds,
  socketStatus,
  menuOpen,
  setMenuOpen,
  showNotice,
  handleLogout,
  selectChat,
  setShowNewChat,
  setShowCreateGroup,
  setError,
  setSelectedMemberIds,
  setGroupName,
  messageRequestCount,
  setShowMessageRequests,
setNewSearch,
setShowSettings,
}) {
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-mark">
          <MessageCircle size={22} strokeWidth={2.5} />
        </div>

        <span className="brand-name">
          chatter<span>box</span>
        </span>

        <button
          className="icon-button sidebar-menu"
          aria-label="More options"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <MoreHorizontal size={21} />
        </button>

        {menuOpen && (
          <div className="floating-menu">
            <button
  onClick={() => {
    setMenuOpen(false);
    setShowSettings(true);
  }}
>
  <Settings size={16} />
  Settings
</button>

            <button
  onClick={() => {
    setMenuOpen(false);
    handleLogout();
  }}
>
  <LogOut size={16} />
  Log out
</button>
          </div>
        )}
      </div>

      <div className="profile-strip">
        <div className={`my-avatar ${colorFor(user.username)}`}>
          {initials(user.username)}
          <span className="online-dot" />
        </div>

        <div className="profile-copy">
          <strong>{user.username}</strong>
          <span>
            <i /> {socketStatus === "connected" ? "Connected" : "Connecting..."}
          </span>
        </div>

        <button
          className="icon-button"
          aria-label="Notifications"
          onClick={() => showNotice("You're all caught up!")}
        >
          <Bell size={18} />
        </button>
      </div>

      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR SPACE</span>
          <h1>
            Messages <span className="count-pill">{chats.length}</span>
          </h1>
        </div>

        <button
          className="new-chat-button"
          aria-label="New chat"
          onClick={() => setShowNewChat(true)}
        >
          <Plus size={19} />
        </button>
      </div>

      <label className="search-box modal-search">
        <Search size={18} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search conversations"
          aria-label="Search conversations"
        />
      </label>

      <div className="chat-filters">

        <button
          className={chatFilter === "all" ? "filter-active" : ""}
          onClick={() => setChatFilter("all")}
        >
          All people
        </button>

        <button
          className={chatFilter === "unread" ? "filter-active" : ""}
          onClick={() => setChatFilter("unread")}
        >
          Unread
          {chats.some((chat) => chat.unread > 0) && (
            <span className="filter-count">
              {chats.reduce(
                (total, chat) => total + (chat.unread || 0),
                0
              )}
            </span>
          )}
        </button>

        <button
          className={chatFilter === "groups" ? "filter-active" : ""}
          onClick={() => setChatFilter("groups")}
        >
          Groups
        </button>
      </div>
       <button
  type="button"
  className="message-requests-button"
  onClick={() => {
    setShowMessageRequests(true);
  }}
>
  <span className="message-requests-icon">
    <Mail size={18} />
  </span>

  <span className="message-requests-copy">
    <strong>Message Requests</strong>
    <small>Messages from people you haven't accepted</small>
  </span>

  {messageRequestCount > 0 && (
    <span className="message-requests-count">
      {messageRequestCount}
    </span>
  )}
</button>
      <div className="conversation-list">
        <div className="list-label">PEOPLE</div>

        {filteredChats.map((chat) => {
          const last = chat.messages?.[chat.messages.length - 1];

          return (
            <button
              key={chat.id}
              className={`conversation ${
                sameId(activeId, chat.id) ? "conversation-active" : ""
              }`}
              onClick={() => selectChat(chat)}
            >
              <Avatar
                name={chat.username || chat.name}
                online={!chat.isGroup && onlineIds.has(String(chat.id))}
              />

              <span className="conversation-copy">
                <span className="conversation-top">
                  <strong>{chat.username || chat.name}</strong>
                  <time>{last ? getTime(last.createdAt) : ""}</time>
                </span>

                <span className="conversation-bottom">
                  <span className="last-message">
                    {last
                      ? `${sameId(last.senderId, user.id) ? "You: " : ""}${last.text}`
                      : chat.isGroup
                        ? "Start a group conversation"
                        : chat.email || "Start a conversation"}
                  </span>

                  {chat.unread > 0 && (
                    <span className="unread-count">{chat.unread}</span>
                  )}
                </span>
              </span>
            </button>
          );
        })}

        {filteredChats.length === 0 && (
          <div className="empty-search">
            <Users size={23} />
            <strong>No people found</strong>
            <span>Try another search or add a conversation.</span>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <button onClick={() => setShowNewChat(true)}>
          <Users size={18} />
          <span>Find people</span>
        </button>

        <button onClick={handleLogout}>
          <LogOut size={18} />
          <span>Log out</span>
        </button>

        <button
          onClick={() => {
            setError("");
            setSelectedMemberIds([]);
            setGroupName("");
            setNewSearch("");
            setShowCreateGroup(true);
          }}
        >
          <Users size={18} />
          <span>Create group</span>
        </button>

        <div className="footer-note">
          <span className="footer-spark">✳</span>
          <span>
            Good conversations
            <br />
            start with hello.
          </span>
        </div>
      </div>
    </aside>
  );
}