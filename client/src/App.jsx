import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { MessageCircle, LoaderCircle, Plus } from "lucide-react";

import AuthScreen from "./components/AuthScreen.jsx";
import ChatSidebar from "./components/ChatSidebar.jsx";
import ChatHeader from "./components/ChatHeader.jsx";
import MessageComposer from "./components/MessageComposer.jsx";
import FindPeopleModal from "./components/FindPeopleModal.jsx";
import CreateGroupModal from "./components/CreateGroupModal.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import ChatBackgroundPicker from "./components/ChatBackgroundPicker.jsx";
import ChatError from "./components/ChatError.jsx";
import ConversationBody from "./components/ConversationBody.jsx";
import ReplyPreview from "./components/ReplyPreview.jsx";
import NotificationToasts from "./components/NotificationToasts.jsx";
import { api, connectSocket } from "./api.js";
import { sameId } from "./utils/chatHelpers.js";
import useMessageActions from "./hooks/useMessageActions";
import useChatMessages from "./hooks/useChatMessages";
import useChatSocket from "./hooks/useChatSocket";
import MessageRequestsModal from "./components/MessageRequestsModal.jsx";
export default function App() {
  console.log("API object:", api);
console.log("API methods:", Object.keys(api));
console.log("getMessageRequests:", api.getMessageRequests);
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [search, setSearch] = useState("");

  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  // Private message requests
  const [newSearch, setNewSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [toast, setToast] = useState("");
  const [showActiveStatus, setShowActiveStatus] = useState(true);
  const [savingActiveStatus, setSavingActiveStatus] = useState(false);
  const [error, setError] = useState("");
  const [messageRequests, setMessageRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showMessageRequests, setShowMessageRequests] = useState(false);
  const [onlineIds, setOnlineIds] = useState(() => new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [chatFilter, setChatFilter] = useState("all");
  const [groups, setGroups] = useState([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [savingGroup, setSavingGroup] = useState(false);
const [socket, setSocket] = useState(null);
const [mentionToast, setMentionToast] = useState(null);
const [draft, setDraft] = useState("");
const [replyTo, setReplyTo] = useState(null);
const [editDraft, setEditDraft] = useState("");
const [editingMessageId, setEditingMessageId] = useState("");
const [savingEdit, setSavingEdit] = useState(false);
  const bottomRef = useRef(null);
  const toastTimer = useRef(null);
  const activeIdRef = useRef(activeId);
  const inputRef = useRef(null);
  const socketRef = useRef(null);
const [mentionSuccessToast, setMentionSuccessToast] = useState("");
const [showSettings, setShowSettings] = useState(false);
const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
const [theme, setTheme] = useState("light");
const [savingTheme, setSavingTheme] = useState(false);
const [savingBackground, setSavingBackground] = useState(false);
  const activeChat = chats.find((chat) => sameId(chat.id, activeId));
  
const showNotice = useCallback((message) => {
  setToast(message);

  if (toastTimer.current) {
    window.clearTimeout(toastTimer.current);
  }

  toastTimer.current = window.setTimeout(() => setToast(""), 2800);
}, []);
const loadMessageRequests = useCallback(async () => {
  if (!user) return;

  setLoadingRequests(true);

  try {
    const { requests } = await api.getMessageRequests();
    setMessageRequests(requests || []);
  } catch (err) {
    console.error("Could not load message requests:", err);
  } finally {
    setLoadingRequests(false);
  }
}, [user]);
// Reload requests whenever the recipient opens the modal.
useEffect(() => {
  if (!user || !showMessageRequests) return;

  loadMessageRequests();
}, [user, showMessageRequests, loadMessageRequests]);
function handleAcceptedRequest(userId) {
  const requestedUser = chats.find((chat) =>
    sameId(chat.id, userId)
  );

  if (requestedUser) {
    selectChat({
      ...requestedUser,
      conversationStatus: "accepted",
    });
  }

  loadMessageRequests();
}
  const {
  sendMessage,
  handleReply,
  handleDeleteMessage,
  startEditing,
  cancelEditing,
  saveEditedMessage,
  removeImage,
} = useMessageActions({
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
});

useChatMessages({
  socket,
  user,
  activeIdRef,
  setChats,
  setOnlineIds,
});

useChatSocket({
  socket,
  setSocketStatus,
  setError,
  setMentionToast,
});

function openBackgroundPicker(chat) {
  if (!chat) return;

  setBackgroundPickerOpen(true);
}

async function handleBackgroundChange(background) {
  if (!activeChat || savingBackground) return;

  setSavingBackground(true);
  setError("");

try {
  if (activeChat.isGroup) {
    await api.updateGroupBackground(activeChat.id, background);

    // Update the groups list.
    setGroups((previous) =>
      previous.map((group) =>
        sameId(group.id, activeChat.id)
          ? { ...group, background }
          : group
      )
    );
  } else {
    await api.updateConversationBackground(activeChat.id, background);
  }

  // Update the current user's chat list.
  setChats((previous) =>
    previous.map((chat) =>
      sameId(chat.id, activeChat.id)
        ? { ...chat, background }
        : chat
    )
  );

    setBackgroundPickerOpen(false);
    showNotice("Chat background updated.");
  } catch (err) {
    setError(err.message || "Could not update chat background.");
  } finally {
    setSavingBackground(false);
  }
}
async function handleActiveStatusChange(nextValue) {
  if (savingActiveStatus) return;

  setSavingActiveStatus(true);

  try {
    const data = await api.updateActiveStatus(nextValue);

    setShowActiveStatus(data.showActiveStatus);
  } catch (error) {
    console.error("Active Status update failed:", error);
    alert(error.message);
  } finally {
    setSavingActiveStatus(false);
  }
}
// Update group messages when an attachment is removed.
useEffect(() => {
  if (!socket) return;

  function handleAttachmentRemoved(updatedMessage) {
    setChats((previousChats) =>
      previousChats.map((chat) => {
        if (
          !chat.isGroup ||
          !sameId(chat.id, updatedMessage.groupId)
        ) {
          return chat;
        }

        const messages = chat.messages || [];

        // If the message contained only an image, remove
        // the entire message from the conversation.
        if (updatedMessage.deleted) {
          return {
            ...chat,
            messages: messages.filter(
              (message) =>
                !sameId(message.id, updatedMessage.id)
            ),
          };
        }

        // If the message also contained text, preserve
        // the text and remove only the attachment.
        return {
          ...chat,
          messages: messages.map((message) =>
            sameId(message.id, updatedMessage.id)
              ? { ...message, attachment: null }
              : message
          ),
        };
      })
    );
  }

  socket.on(
    "group:message:attachment-removed",
    handleAttachmentRemoved
  );

  return () => {
    socket.off(
      "group:message:attachment-removed",
      handleAttachmentRemoved
    );
  };
}, [socket]);
// Handle private and group message deletion updates.
useEffect(() => {
  if (!socket || !user) return;

  const currentUserId = user.id ?? user._id ?? user.userId;

  function updateDeletedMessage(updatedMessage, isGroupMessage) {
    setChats((previousChats) =>
      previousChats.map((chat) => {
        if (
          isGroupMessage &&
          (!chat.isGroup ||
            !sameId(chat.id, updatedMessage.groupId))
        ) {
          return chat;
        }

        if (!isGroupMessage && chat.isGroup) {
          return chat;
        }

        const messages = chat.messages || [];

        // Delete only from this user's view.
        if (updatedMessage.deleteType === "deleteForYou") {
          if (!sameId(updatedMessage.deletedFor, currentUserId)) {
            return chat;
          }

          return {
            ...chat,
            messages: messages.filter(
              (message) =>
                !sameId(message.id ?? message._id, updatedMessage.id)
            ),
          };
        }

        // Keep the message, but replace its content with a placeholder.
        if (updatedMessage.isDeleted) {
          return {
            ...chat,
            messages: messages.map((message) =>
              sameId(message.id ?? message._id, updatedMessage.id)
                ? {
                    ...message,
                    text: "",
                    attachment: null,
                    isDeleted: true,
                    deletedBy: updatedMessage.deletedBy,
                    deletedAt: updatedMessage.deletedAt,
                    replyTo: null,
                  }
                : message
            ),
          };
        }

        return chat;
      })
    );
  }

  function handlePrivateMessageDeleted(message) {
    updateDeletedMessage(message, false);
  }

  function handleGroupMessageDeleted(message) {
    updateDeletedMessage(message, true);
  }

  socket.on("message:deleted", handlePrivateMessageDeleted);
  socket.on("group:message:deleted", handleGroupMessageDeleted);

  return () => {
    socket.off("message:deleted", handlePrivateMessageDeleted);
    socket.off("group:message:deleted", handleGroupMessageDeleted);
  };
}, [socket, user]);
  const filteredChats = useMemo(() => {
    const term = search.trim().toLowerCase();

    return chats.filter((chat) => {
      const name = chat.name || chat.username || "";
      const matchesSearch =
        !term ||
        name.toLowerCase().includes(term) ||
        (chat.email || "").toLowerCase().includes(term);

      const matchesFilter =
        chatFilter === "all" ||
        (chatFilter === "unread" && (chat.unread || 0) > 0) ||
        (chatFilter === "groups" && chat.isGroup === true);

      return matchesSearch && matchesFilter;
    });
  }, [chats, search, chatFilter]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
useEffect(() => {
  if (!user) return;

  const savedTheme = user.theme === "dark" ? "dark" : "light";

  setTheme(savedTheme);
  document.documentElement.setAttribute("data-theme", savedTheme);
}, [user]);
async function handleThemeChange(nextTheme) {
  if (!["light", "dark"].includes(nextTheme)) return;
  if (savingTheme || nextTheme === theme) return;

  setSavingTheme(true);
  setError("");

  try {
    const result = await api.updateTheme(nextTheme);
    const savedTheme = result.theme || nextTheme;

    setTheme(savedTheme);
    setUser((previous) =>
      previous ? { ...previous, theme: savedTheme } : previous
    );

    document.documentElement.setAttribute("data-theme", savedTheme);
    showNotice("Appearance updated.");
  } catch (err) {
    setError(err.message || "Could not update appearance.");
  } finally {
    setSavingTheme(false);
  }
}

  const addOrUpdateChat = useCallback((person) => {
    setChats((previous) => {
      const existing = previous.find((chat) => sameId(chat.id, person.id));

      if (existing) {
        return previous.map((chat) =>
          sameId(chat.id, person.id) ? { ...chat, ...person } : chat
        );
      }

      return [{ ...person, messages: [], unread: 0 }, ...previous];
    });
  }, []);

  // Restore the login session.
  useEffect(() => {
    let cancelled = false;

    api.me()
      .then(({ user: current }) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);


  // Load conversations and connect Socket.IO.
  useEffect(() => {
    if (!user) return;

    let mounted = true;

    const chatSocket = connectSocket();
    socketRef.current = chatSocket;
    setSocket(chatSocket);

    api.users()
      .then(({ users }) => {
        if (!mounted) return;

        setChats((previous) => {
          const existingPrivateChats = new Map(
            previous
              .filter((chat) => !chat.isGroup)
              .map((chat) => [String(chat.id), chat])
          );

          const privateChats = users.map((person) => {
            const existing = existingPrivateChats.get(
              String(person.id)
            );

            return {
              ...person,
              messages: existing?.messages || [],
              unread: existing?.unread || 0,
            };
          });

          return [
            ...previous.filter((chat) => chat.isGroup),
            ...privateChats,
          ];
        });
      })
      .catch((err) => {
        if (mounted) setError(err.message);
      });

    api.groups()
      .then(({ groups: savedGroups }) => {
        if (!mounted) return;

        setGroups(savedGroups);

        setChats((previous) => {
          const groupChats = savedGroups.map((group) => {
            const existing = previous.find(
              (chat) =>
                chat.isGroup && sameId(chat.id, group.id)
            );

            return {
              ...group,
              isGroup: true,
              messages: existing?.messages || [],
              unread: existing?.unread || 0,
            };
          });

          return [
            ...groupChats,
            ...previous.filter((chat) => !chat.isGroup),
          ];
        });
      })
      .catch((err) => {
        if (mounted) setError(err.message);
      });

    return () => {
      mounted = false;

      chatSocket.disconnect();

      if (socketRef.current === chatSocket) {
        socketRef.current = null;
      }

      setSocket((current) =>
        current === chatSocket ? null : current
      );
    };
  }, [user]);

// Load incoming private message requests.
useEffect(() => {
  if (!user) {
    setMessageRequests([]);
    return;
  }

  loadMessageRequests();
}, [user, loadMessageRequests]);

// Refresh requests when a new private message arrives.
useEffect(() => {
  if (!socket) return;

  function handleNewMessage() {
    loadMessageRequests();
  }

  socket.on("message:new", handleNewMessage);

  return () => {
    socket.off("message:new", handleNewMessage);
  };
}, [socket, loadMessageRequests]);

  // Load the selected conversation's history.
  useEffect(() => {
    if (!user || !activeId) return;

    let cancelled = false;

    setLoadingMessages(true);
    setError("");

    const historyRequest = activeChat?.isGroup
      ? api.groupMessages(activeId)
      : api.messages(activeId);

    historyRequest
      .then(({ messages }) => {
        if (cancelled) return;

        setChats((previous) =>
          previous.map((chat) =>
            sameId(chat.id, activeId)
              ? { ...chat, messages, unread: 0 }
              : chat
          )
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, activeId, activeChat?.isGroup]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [activeId, activeChat?.messages?.length]);

  // Search for people while either modal is open.
  useEffect(() => {
    if (!showNewChat && !showCreateGroup) return;

    const timer = window.setTimeout(async () => {
      try {
        const { users } = await api.users(newSearch);
        setSearchResults(users);
      } catch (err) {
        setError(err.message);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [showNewChat, showCreateGroup, newSearch]);

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // Clear the local UI even if the network is unavailable.
    }

    socketRef.current?.disconnect();
    setUser(null);
    setChats([]);
    setActiveId("");
    setMessageRequests([]);
    setShowMessageRequests(false);
    setMobileChatOpen(false);
    setMenuOpen(false);
    setGroups([]);
    setSelectedMemberIds([]);
    setShowCreateGroup(false);
  }

  function selectChat(person) {
    addOrUpdateChat({ ...person, unread: 0 });
    setActiveId(person.id);
    activeIdRef.current = person.id;
    setMobileChatOpen(true);
    setShowNewChat(false);
    setNewSearch("");
    setSearchResults([]);

    setChats((previous) =>
      previous.map((chat) =>
        sameId(chat.id, person.id) ? { ...chat, unread: 0 } : chat
      )
    );
  }

  async function handleCreateGroup(event) {
    event.preventDefault();

    const name = groupName.trim();

    if (name.length < 2 || name.length > 50) {
      setError("Group name must be between 2 and 50 characters.");
      return;
    }

    if (selectedMemberIds.length === 0) {
      setError("Choose at least one person for your group.");
      return;
    }

    if (savingGroup) return;

    setSavingGroup(true);
    setError("");

    try {
      const { group } = await api.createGroup({
        name,
        memberIds: selectedMemberIds,
      });

      const newGroup = {
        ...group,
        isGroup: true,
        messages: [],
        unread: 0,
      };

      setGroups((previous) => [group, ...previous]);

      setChats((previous) => [
        newGroup,
        ...previous.filter(
          (chat) => !(chat.isGroup && sameId(chat.id, group.id))
        ),
      ]);

      setActiveId(group.id);
      activeIdRef.current = group.id;
      setMobileChatOpen(true);
      setShowCreateGroup(false);
      setGroupName("");
      setSelectedMemberIds([]);
      setNewSearch("");
      setError("");

      showNotice("Group created successfully!");
    } catch (err) {
      setError(err.message || "Could not create the group.");
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleDeleteGroup(group) {
    if (!group?.isGroup) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${group.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await api.deleteGroup(group.id);

      setChats((previous) =>
        previous.filter((chat) => !sameId(chat.id, group.id))
      );

      setGroups((previous) =>
        previous.filter((item) => !sameId(item.id, group.id))
      );

      if (sameId(activeId, group.id)) {
        setActiveId("");
        activeIdRef.current = "";
        setMobileChatOpen(false);
      }

      showNotice("Group deleted successfully.");
    } catch (err) {
      setError(err.message || "Could not delete the group.");
    }
  }

  
useEffect(() => {
 if (
  !activeChat ||
  activeChat.isGroup ||
  activeChat.conversationStatus !== "accepted"
) {
  return;
}

  console.log("Active chat:", activeChat);
  console.log("Chat ID:", activeChat.id);
  console.log("Chat MongoDB ID:", activeChat._id);

  let cancelled = false;

  api.getConversationSettings(activeChat.id)
    .then(({ background }) => {
      if (cancelled) return;

      setChats((previous) =>
        previous.map((chat) => {
          if (!sameId(chat.id, activeChat.id)) return chat;

          const savedBackground = background || "default";

          if (chat.background === savedBackground) return chat;

          return {
            ...chat,
            background: savedBackground,
          };
        })
      );
    })
    .catch((err) => {
      if (!cancelled) {
        console.error("Could not load conversation settings:", err);
      }
    });

  return () => {
    cancelled = true;
  };
}, [
  activeChat?.id,
  activeChat?.isGroup,
  activeChat?.conversationStatus,
]);

  if (checkingSession) {
    return (
      <div className="full-loading">
        <LoaderCircle className="spin" size={28} />
        <span>Getting your chats ready...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser);
          setError("");
        }}
      />
    );
  }

  return (
    <main className="app-shell">
      <div className={mobileChatOpen ? "sidebar-hidden-mobile" : ""}>
        <ChatSidebar
          user={user}
          chats={chats}
          activeId={activeId}
          search={search}
          setSearch={setSearch}
          filteredChats={filteredChats}
          chatFilter={chatFilter}
          setChatFilter={setChatFilter}
          onlineIds={onlineIds}
          socketStatus={socketStatus}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          showNotice={showNotice}
          handleLogout={handleLogout}
          selectChat={selectChat}
          setShowNewChat={setShowNewChat}
          setShowCreateGroup={setShowCreateGroup}
          setError={setError}
          setSelectedMemberIds={setSelectedMemberIds}
          setGroupName={setGroupName}
setNewSearch={setNewSearch}
setShowSettings={setShowSettings}
messageRequestCount={messageRequests.length}
setShowMessageRequests={setShowMessageRequests}
        />
      </div>

      <section
  className={`chat-panel ${
    mobileChatOpen ? "chat-panel-mobile-open" : ""
  } ${
    activeChat
      ? `chat-background-${activeChat.background || "default"}`
      : ""
  }`}
>
        {activeChat ? (
          <>
            <ChatHeader
              activeChat={activeChat}
              onlineIds={onlineIds}
              setMobileChatOpen={setMobileChatOpen}
              showNotice={showNotice}
              handleDeleteGroup={handleDeleteGroup}
              onOpenBackgroundPicker={openBackgroundPicker}
              messageRequestCount={messageRequests.length}
              setShowMessageRequests={setShowMessageRequests}
            />

            <ChatError error={error} onDismiss={() => setError("")} />
<ConversationBody
  activeChat={activeChat}
  loadingMessages={loadingMessages}
  user={user}
  onReply={handleReply}
  deleteMessage={handleDeleteMessage}
  editingMessageId={editingMessageId}
  editDraft={editDraft}
  savingEdit={savingEdit}
  setEditDraft={setEditDraft}
  saveEditedMessage={saveEditedMessage}
  cancelEditing={cancelEditing}
  startEditing={startEditing}
  removeImage={removeImage}
  bottomRef={bottomRef}
  mentionSuccessToast={mentionSuccessToast}
  setMentionSuccessToast={setMentionSuccessToast}
/>


            <ReplyPreview
              replyTo={replyTo}
              onCancel={() => setReplyTo(null)}
            /><MessageComposer
  activeChat={activeChat}
  draft={draft}
  setDraft={setDraft}
  inputRef={inputRef}
  sendMessage={sendMessage}
  showNotice={showNotice}
  socketStatus={socketStatus}
  mentionUsers={
    activeChat.isGroup
      ? activeChat.members || []
      : []
  }
/>
          </>
        ) : (
          <div className="empty-chat-panel">
            <div className="welcome-icon">
              <MessageCircle size={28} />
            </div>
            <h2>Your conversations, all in one place.</h2>
            <p>
              Select someone from your people list or start a new conversation.
            </p>
            <button
              className="create-chat-submit"
              onClick={() => setShowNewChat(true)}
            >
              <Plus size={18} /> Find people
            </button>
          </div>
        )}
      </section>

      <FindPeopleModal
        open={showNewChat}
        setOpen={setShowNewChat}
        newSearch={newSearch}
        setNewSearch={setNewSearch}
        searchResults={searchResults}
        selectChat={selectChat}
      />
<SettingsModal
  isOpen={showSettings}
  onClose={() => setShowSettings(false)}
  theme={theme}
  onThemeChange={handleThemeChange}
  savingTheme={savingTheme}
  showActiveStatus={showActiveStatus}
  onActiveStatusChange={handleActiveStatusChange}
  savingActiveStatus={savingActiveStatus}
/>
{showMessageRequests && (
  <MessageRequestsModal
    requests={messageRequests}
    loading={loadingRequests}
    onClose={() => setShowMessageRequests(false)}
    onRequestUpdated={loadMessageRequests}
    onAccepted={handleAcceptedRequest}
    showNotice={showNotice}
  />
)}
<ChatBackgroundPicker
  isOpen={backgroundPickerOpen}
  onClose={() => setBackgroundPickerOpen(false)}
  currentBackground={activeChat?.background || "default"}
  onSelect={handleBackgroundChange}
  saving={savingBackground}
/>
      <CreateGroupModal
        open={showCreateGroup}
        setOpen={setShowCreateGroup}
        groupName={groupName}
        setGroupName={setGroupName}
        newSearch={newSearch}
        setNewSearch={setNewSearch}
        searchResults={searchResults}
        user={user}
        selectedMemberIds={selectedMemberIds}
        setSelectedMemberIds={setSelectedMemberIds}
        savingGroup={savingGroup}
        handleCreateGroup={handleCreateGroup}
      />

      <NotificationToasts
        toast={toast}
        mentionToast={mentionToast}
        onDismissMention={() => setMentionToast(null)}
        mentionSuccessToast={mentionSuccessToast}
        onDismissMentionSuccess={() => setMentionSuccessToast("")}
      />

    </main>
  );
}
