
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  MessageCircle,
  LoaderCircle,
  Plus,
} from "lucide-react";

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
import CallModal from "./components/CallModal.jsx";
import MessageRequestsModal from "./components/MessageRequestsModal.jsx";

import {
  registerPushNotifications,
  unregisterPushNotifications,
  setNotificationTapHandler,
  clearPendingIncomingCallAction,
} from "./services/pushNotifications.js";

import { api, connectSocket } from "./api.js";
import { sameId } from "./utils/chatHelpers.js";

import useMessageActions from "./hooks/useMessageActions.js";
import useChatMessages from "./hooks/useChatMessages.js";
import useChatSocket from "./hooks/useChatSocket.js";
import useWebRTC from "./hooks/useWebRTC.js";
import useConversationSettings from "./hooks/useConversationSettings.js";
import useMessageSocketEvents from "./hooks/useMessageSocketEvents.js";

export default function App() {
  // =========================
  // 1. USER AND CHAT STATE
  // =========================

  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [search, setSearch] = useState("");

  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);

  // =========================
  // 2. MESSAGE REQUEST STATE
  // =========================

  const [newSearch, setNewSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const [messageRequests, setMessageRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showMessageRequests, setShowMessageRequests] = useState(false);

  // =========================
  // 3. NOTIFICATION STATE
  // =========================

  const [toast, setToast] = useState("");
  const [mentionToast, setMentionToast] = useState(null);
  const [mentionSuccessToast, setMentionSuccessToast] = useState("");

  const [error, setError] = useState("");

  // =========================
  // 4. CHAT AND SOCKET STATE
  // =========================

  const [onlineIds, setOnlineIds] = useState(() => new Set());
  const [socketStatus, setSocketStatus] = useState("connecting");

  const [socket, setSocket] = useState(null);

  const [chatFilter, setChatFilter] = useState("all");
  const [menuOpen, setMenuOpen] = useState(false);

  // =========================
  // 5. GROUP STATE
  // =========================

  const [groups, setGroups] = useState([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [savingGroup, setSavingGroup] = useState(false);

  // =========================
  // 6. MESSAGE COMPOSER STATE
  // =========================

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null);

  const [editDraft, setEditDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // =========================
  // 7. LOADING STATE
  // =========================

  const [loadingMessages, setLoadingMessages] = useState(false);

  // =========================
  // 8. SETTINGS STATE
  // =========================

  const [showSettings, setShowSettings] = useState(false);

  const [theme, setTheme] = useState("light");
  const [savingTheme, setSavingTheme] = useState(false);

  const [showActiveStatus, setShowActiveStatus] = useState(true);
  const [savingActiveStatus, setSavingActiveStatus] = useState(false);

  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  const [savingBackground, setSavingBackground] = useState(false);

  // =========================
  // 9. CALL STATE
  // =========================

  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);

  const [callStatus, setCallStatus] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // =========================
  // 10. REFS
  // =========================
  const pushRegistrationUserRef = useRef(null);

  const bottomRef = useRef(null);
  const toastTimer = useRef(null);

  const activeIdRef = useRef(activeId);
  const inputRef = useRef(null);
  const socketRef = useRef(null);

  const pendingNotificationRef = useRef(null);
  const chatsRef = useRef(chats);

  const recoveringCallIdsRef = useRef(new Set());
  const handledCallActionsRef = useRef(new Set());
  // =========================
  // 11. ACTIVE CHAT
  // =========================

  const activeChat = chats.find((chat) =>
    sameId(chat.id, activeId)
  );


  // =========================
  // 12. CUSTOM HOOKS
  // =========================

  useConversationSettings({
    user,
    activeChat,
    setChats,
    socket, 
  });

  useMessageSocketEvents({
    socket,
    user,
    setChats,
  });

  const {
    localStream,
    remoteStream,
    connectionState,
    mediaError,
    createOffer,
    createAnswer,
    handleRemoteAnswer,
    handleRemoteCandidate,
    cleanupCall,
    setCallId,
  } = useWebRTC(socket);

  // =========================
  // 13. NOTIFICATION HANDLER
  // =========================

  const showNotice = useCallback((message) => {
    setToast(message);

    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }

    toastTimer.current = window.setTimeout(() => {
      setToast("");
    }, 2800);
  }, []);

  // =========================
  // 14. MESSAGE REQUESTS
  // =========================
const loadMessageRequests = useCallback(async () => {
  if (!user) return;

  setLoadingRequests(true);

  try {
    const response = await api.getMessageRequests();
    setMessageRequests(response?.requests || []);
  } catch (err) {
    console.error("Could not load message requests:", err);
  } finally {
    setLoadingRequests(false);
  }
}, [user]);

// Keep the latest chats available for notification taps.
useEffect(() => {
  chatsRef.current = chats;
}, [chats]);

// Load when the user logs in.
useEffect(() => {
  if (!user) {
    setMessageRequests([]);
    return;
  }

  loadMessageRequests();
}, [user, loadMessageRequests]);

// Refresh when the modal opens.
useEffect(() => {
  if (!user || !showMessageRequests) return;

  loadMessageRequests();
}, [user, showMessageRequests, loadMessageRequests]);

useEffect(() => {
  const userId = user?.id ?? user?._id ?? user?.userId;

  if (!userId) {
    pushRegistrationUserRef.current = null;
    return;
  }

  const normalizedUserId = String(userId);

  // Prevent duplicate registration for the same account.
  if (pushRegistrationUserRef.current === normalizedUserId) {
    return;
  }

  pushRegistrationUserRef.current = normalizedUserId;

  let cancelled = false;

  const register = async () => {
    try {
      await registerPushNotifications(normalizedUserId);

      if (!cancelled) {
        console.log("Push notifications registered for user.");
      }
    } catch (error) {
      if (!cancelled) {
        console.error(
          "Push notification registration failed:",
          error
        );

        // Allow another attempt if registration fails.
        if (
          pushRegistrationUserRef.current === normalizedUserId
        ) {
          pushRegistrationUserRef.current = null;
        }
      }
    }
  };

  register();

  return () => {
    cancelled = true;
  };
}, [user?.id, user?._id, user?.userId]);


 useEffect(() => {
  
    const unlockAudio = async () => {
      const audio = new Audio("/sounds/incoming-ringtone.mp3");
      audio.volume = 0;

      try {
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        console.log("Audio unlocked successfully.");
      } catch (error) {
        console.warn("Audio unlock failed:", error);
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
    };
  }, []);
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

  // =========================
  // 15. MESSAGE ACTIONS HOOK
  // =========================

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

  // =========================
  // 16. CHAT MESSAGES HOOK
  // =========================

  useChatMessages({
    socket,
    user,
    activeIdRef,
    setChats,
    setOnlineIds,
  });

  // =========================
  // 17. CHAT SOCKET HOOK
  // =========================

  useChatSocket({
    socket,
    setSocketStatus,
    setError,
    setMentionToast,
  });

  // =========================
  // 18. END CALL HANDLER
  // =========================

  const handleEndCall = useCallback(() => {
    if (!activeCall) return;

    if (socketRef.current) {
      socketRef.current.emit("call:end", {
        recipientId: activeCall.recipientId,
        callId: activeCall.callId,
      });
    }

    cleanupCall();

    setActiveCall(null);
    setIncomingCall(null);
    setCallStatus("");
    setIsMuted(false);
    setIsCameraOff(false);
  }, [activeCall, cleanupCall]);

  // =========================
  // 19. CALL SOCKET EVENTS
  // =========================

  useEffect(() => {
    if (!socket) return;

function handleIncomingCall(call) {
  console.log("📞 INCOMING CALL RECEIVED:", call);

  console.log("Current activeCall:", activeCall);
  console.log("Current incomingCall:", incomingCall);

  if (activeCall || incomingCall) {
    console.warn("⚠️ Automatically declining because user is busy.");

    socket.emit("call:respond", {
      callerId: call.callerId,
      callId: call.callId,
      accepted: false,
    });

    return;
  }

  const caller = chats.find((chat) =>
    sameId(chat.id, call.callerId)
  );

  console.log("✅ Showing incoming call screen.");

  setIncomingCall({
    ...call,
    displayName:
      caller?.name ||
      caller?.username ||
      "Chatterbox user",
  });
}
    // Caller receives the response.
    async function handleCallResponse(response) {
      if (
        !activeCall ||
        response.callId !== activeCall.callId
      ) {
        return;
      }

      if (!response.accepted) {
        cleanupCall();

        setActiveCall(null);
        setCallStatus("");
        setIsMuted(false);
        setIsCameraOff(false);

        showNotice("The user declined your call.");
        return;
      }

      try {
        await handleRemoteAnswer(response.answer);

        setActiveCall((previous) =>
          previous
            ? { ...previous, status: "Connected" }
            : null
        );

        setCallStatus("Connected");
      } catch (err) {
        console.error("Could not establish call:", err);
        handleEndCall();
      }
    }

    // Receive ICE candidates.
    async function handleIncomingCandidate(data) {
      const currentCallId =
        activeCall?.callId || incomingCall?.callId;

      if (data.callId !== currentCallId) return;

      try {
        await handleRemoteCandidate(data.candidate);
      } catch (err) {
        console.error(
          "Could not process ICE candidate:",
          err
        );
      }
    }

    // Call ended.
function handleCallEnded(data) {
  if (!data?.callId) return;

  const currentCallId =
    activeCall?.callId || incomingCall?.callId;

  if (data.callId !== currentCallId) return;

  cleanupCall();

  setActiveCall(null);
  setIncomingCall(null);
  setCallStatus("");
  setIsMuted(false);
  setIsCameraOff(false);

  showNotice("The call has ended.");
}

    socket.on("call:incoming", handleIncomingCall);
    socket.on("call:response", handleCallResponse);
    socket.on("call:ice-candidate", handleIncomingCandidate);
    socket.on("call:ended", handleCallEnded);

    return () => {
      socket.off("call:incoming", handleIncomingCall);
      socket.off("call:response", handleCallResponse);
      socket.off("call:ice-candidate", handleIncomingCandidate);
      socket.off("call:ended", handleCallEnded);
    };
  }, [
    socket,
    activeCall,
    incomingCall,
    chats,
    handleRemoteAnswer,
    handleRemoteCandidate,
    cleanupCall,
    handleEndCall,
    showNotice,
  ]);

  // =========================
  // 20. START CALL
  // =========================
const handleStartCall = async (chat, callType) => {
  if (!socketRef.current || !chat || activeCall || incomingCall) {
    return;
  }

  if (chat.isGroup) {
    showNotice("Calls are only available for private conversations.");
    return;
  }

  try {
    setCallStatus("Calling...");

    const offer = await createOffer(chat.id, callType);

    socketRef.current.emit(
      "call:start",
      {
        recipientId: chat.id,
        callType,
        offer,
      },
      (response) => {
        if (!response?.ok) {
          cleanupCall();
          setCallStatus("");
          showNotice(response?.message || "Could not start call.");
          return;
        }

        setCallId(response.callId);

        setActiveCall({
          callId: response.callId,
          recipientId: chat.id,
          callType,
          displayName: chat.username || chat.name,
          status: "Calling...",
        });
      }
    );
  } catch (error) {
    console.error("Start call error:", error);
    cleanupCall();
    setCallStatus("");
    showNotice(error.message || "Could not start call.");
  }
};
// =========================
// 21. ACCEPT INCOMING CALL
// =========================


async function handleAcceptIncoming(callOverride = null) {
  const call = callOverride || incomingCall;
  const currentSocket = socketRef.current;

  console.log("ACCEPT CALL DEBUG:", {
    callId: call?.callId,
    callerId: call?.callerId,
    callType: call?.callType,
    hasOffer: Boolean(call?.offer),
    offerType: call?.offer?.type,
    hasSdp: Boolean(call?.offer?.sdp),
    socketConnected: Boolean(currentSocket?.connected),
  });

  if (!call || !currentSocket?.connected) return false;

  if (!call.offer?.sdp || call.offer.type !== "offer") {
    console.error("Missing or invalid incoming WebRTC offer:", call);
    setCallStatus("");
    showNotice("Incoming call offer is missing. Please try again.");
    return false;
  }

  try {
    setCallStatus("Connecting...");

    const answer = await createAnswer(
      call.callerId,
      call.callId,
      call.callType,
      call.offer
    );

    const response = await new Promise((resolve) => {
      currentSocket.emit(
        "call:respond",
        {
          callerId: call.callerId,
          callId: call.callId,
          accepted: true,
          answer,
        },
        resolve
      );
    });

    if (!response?.ok) {
      cleanupCall();
      setIncomingCall(null);
      setActiveCall(null);
      setCallStatus("");
      showNotice(response?.message || "Could not accept the call.");
      return false;
    }

    setActiveCall({
      callId: call.callId,
      recipientId: call.callerId,
      callType: call.callType,
      displayName: call.displayName || "Chatterbox user",
      status: "Connected",
    });

    setIncomingCall(null);
    setCallStatus("Connected");

    return true;
  } catch (err) {
    console.error("Could not accept call:", err);

    cleanupCall();
    setIncomingCall(null);
    setActiveCall(null);
    setCallStatus("");

    showNotice(err.message || "Could not accept the call.");
    return false;
  }
}

// =========================
// 22. DECLINE INCOMING CALL
// =========================

function handleDeclineIncoming(callOverride = null) {
  const call = callOverride || incomingCall;
  const currentSocket = socketRef.current;

  if (!call || !currentSocket) return false;

  currentSocket.emit("call:respond", {
    callerId: call.callerId,
    callId: call.callId,
    accepted: false,
  });

  cleanupCall();

  setIncomingCall(null);
  setActiveCall(null);
  setCallStatus("");
  setIsMuted(false);
  setIsCameraOff(false);

  return true;
}
  // =========================
  // 23. MUTE AND CAMERA
  // =========================

  function handleToggleMute() {
    if (!localStream) return;

    const nextMuted = !isMuted;

    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setIsMuted(nextMuted);
  }

  function handleToggleCamera() {
    if (!localStream) return;

    const nextCameraOff = !isCameraOff;

    localStream.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });

    setIsCameraOff(nextCameraOff);
  }


// =========================
// 24. BACKGROUND PICKER
// =========================

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

      setGroups((previous) =>
        previous.map((group) =>
          sameId(group.id, activeChat.id)
            ? { ...group, background }
            : group
        )
      );
    } else {
      const recipientId = activeChat.id;

      if (!recipientId) {
        throw new Error("Recipient ID is missing.");
      }

      await api.updateConversationBackground(recipientId, background);
    }

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
    console.error("Background update error:", err);
    setError(err.message || "Could not update chat background.");
  } finally {
    setSavingBackground(false);
  }
}

useEffect(() => {
  if (!user) return;

  setShowActiveStatus(user.showActiveStatus ?? true);
}, [user]);
  // =========================
  // 25. ACTIVE STATUS
  // =========================

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

  // =========================
  // 26. FILTERED CHATS
  // =========================

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

  // =========================
  // 27. ACTIVE CHAT REF
  // =========================

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // =========================
  // 28. LOAD USER THEME
  // =========================

  useEffect(() => {
    if (!user) return;

    const savedTheme =
      user.theme === "dark" ? "dark" : "light";

    setTheme(savedTheme);

    document.documentElement.setAttribute(
      "data-theme",
      savedTheme
    );
  }, [user]);

  // =========================
  // 29. UPDATE THEME
  // =========================

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
        previous
          ? { ...previous, theme: savedTheme }
          : previous
      );

      document.documentElement.setAttribute(
        "data-theme",
        savedTheme
      );

      showNotice("Appearance updated.");
    } catch (err) {
      setError(
        err.message || "Could not update appearance."
      );
    } finally {
      setSavingTheme(false);
    }
  }

  // =========================
  // 30. ADD OR UPDATE CHAT
  // =========================

  const addOrUpdateChat = useCallback((person) => {
    setChats((previous) => {
      const existing = previous.find((chat) =>
        sameId(chat.id, person.id)
      );

      if (existing) {
        return previous.map((chat) =>
          sameId(chat.id, person.id)
            ? { ...chat, ...person }
            : chat
        );
      }

      return [
        { ...person, messages: [], unread: 0 },
        ...previous,
      ];
    });
  }, []);

  // =========================
  // 31. RESTORE LOGIN SESSION
  // =========================

  useEffect(() => {
    let cancelled = false;

    api.me()
      .then(({ user: current }) => {
        if (!cancelled) {
          setUser(current);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // =========================
  // 32. LOAD CHATS AND CONNECT SOCKET
  // =========================

  useEffect(() => {
    if (!user) return;

    let mounted = true;

    const chatSocket = connectSocket();

    socketRef.current = chatSocket;
    setSocket(chatSocket);

    // Load private conversations.
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
        if (mounted) {
          setError(err.message);
        }
      });

    // Load groups.
    api.groups()
      .then(({ groups: savedGroups }) => {
        if (!mounted) return;

        setGroups(savedGroups);

        setChats((previous) => {
          const groupChats = savedGroups.map((group) => {
            const existing = previous.find(
              (chat) =>
                chat.isGroup &&
                sameId(chat.id, group.id)
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
        if (mounted) {
          setError(err.message);
        }
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

  // =========================
  // 33. LOAD SELECTED CHAT HISTORY
  // =========================

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
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, activeId, activeChat?.isGroup]);

  // =========================
  // 34. SCROLL TO LATEST MESSAGE
  // =========================

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [activeId, activeChat?.messages?.length]);

  // =========================
  // 35. SEARCH PEOPLE
  // =========================

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

    return () => {
      window.clearTimeout(timer);
    };
  }, [showNewChat, showCreateGroup, newSearch]);

  // =========================
  // 36. SELECT CHAT
  // =========================

  function selectChat(person) {
    addOrUpdateChat({
      ...person,
      unread: 0,
    });

    setActiveId(person.id);
    activeIdRef.current = person.id;

    setMobileChatOpen(true);
    setShowNewChat(false);

    setNewSearch("");
    setSearchResults([]);

    setChats((previous) =>
      previous.map((chat) =>
        sameId(chat.id, person.id)
          ? { ...chat, unread: 0 }
          : chat
      )
    );
  }

// ==========================================
// HANDLE PUSH NOTIFICATION TAPS
// ==========================================

const handleNotificationTap = useCallback(
  (data) => {
    if (!data || !user) {
      pendingNotificationRef.current = data;
      return;
    }

    console.log("Handling notification:", data);

    // --------------------------------------
    // PRIVATE MESSAGE REQUEST
    // --------------------------------------

    if (data.type === "message_request") {
      pendingNotificationRef.current = null;

      setShowMessageRequests(true);

      return;
    }
// --------------------------------------
// ANDROID INCOMING CALL
// --------------------------------------

if (data.type === "incoming_call") {
  const callId = data.callId;

  const nativeAction = data.action || data.callAction;

  let action = "";

  if (
    nativeAction === "com.hazeljane.chatterbox.ANSWER_CALL" ||
    nativeAction === "answer"
  ) {
    action = "answer";
  } else if (
    nativeAction === "com.hazeljane.chatterbox.DECLINE_CALL" ||
    nativeAction === "decline"
  ) {
    action = "decline";
  } else if (
    nativeAction === "com.hazeljane.chatterbox.OPEN_INCOMING_CALL" ||
    nativeAction === "open"
  ) {
    action = "open";
  }

  if (!callId || !action) {
    console.warn("Invalid incoming-call notification action.");
    return;
  }

  const currentSocket = socketRef.current;

  // Wait until the authenticated socket is connected.
  if (!currentSocket?.connected) {
    pendingNotificationRef.current = data;
    return;
  }

  const actionKey = `${callId}:${action}`;

  // Ignore actions already handled.
  if (handledCallActionsRef.current.has(actionKey)) {
    pendingNotificationRef.current = null;
    clearPendingIncomingCallAction().catch(console.error);
    return;
  }

  // Avoid duplicate recovery requests.
  if (recoveringCallIdsRef.current.has(callId)) {
    return;
  }

  recoveringCallIdsRef.current.add(callId);

  currentSocket.emit(
    "call:recover",
    { callId },
    async (response) => {
      try {
        if (!response?.ok || !response.call) {
          console.warn(
            "Incoming call recovery failed:",
            response?.message
          );

          pendingNotificationRef.current = null;

          showNotice(
            response?.message || "This call is no longer available."
          );

          await clearPendingIncomingCallAction();

          return;
        }

        const recoveredCall = response.call;

        const caller = chatsRef.current.find((chat) =>
          sameId(chat.id, recoveredCall.callerId)
        );

        const call = {
          ...recoveredCall,
          displayName:
            caller?.name ||
            caller?.username ||
            recoveredCall.callerName ||
            "Chatterbox user",
        };

        pendingNotificationRef.current = null;

        if (action === "answer") {
          // Answer immediately using the recovered call.
          const accepted = await handleAcceptIncoming(call);

          if (!accepted) {
            // Keep the call visible so the user can still
            // answer manually if automatic answering fails.
            setIncomingCall(call);
          }
        } else if (action === "decline") {
          handleDeclineIncoming(call);
        } else {
          // OPEN: show the normal incoming-call interface.
          setIncomingCall(call);
        }

        handledCallActionsRef.current.add(actionKey);

        await clearPendingIncomingCallAction();
      } catch (error) {
        console.error(
          "Android incoming-call handling failed:",
          error
        );
      } finally {
        recoveringCallIdsRef.current.delete(callId);
      }
    }
  );

  return;
}
    // --------------------------------------
    // GROUP MESSAGE
    // --------------------------------------

    if (data.type === "group_message") {
      const group = chatsRef.current.find(
        (chat) =>
          chat.isGroup &&
          sameId(chat.id, data.groupId)
      );

      if (!group) {
        pendingNotificationRef.current = data;
        console.log("Waiting for group chat to load.");
        return;
      }

      pendingNotificationRef.current = null;
      selectChat(group);

      return;
    }

    // --------------------------------------
    // PRIVATE MESSAGE
    // --------------------------------------

    if (data.type === "private_message") {
      const privateChat = chatsRef.current.find(
        (chat) =>
          !chat.isGroup &&
          sameId(chat.id, data.senderId)
      );

      if (!privateChat) {
        pendingNotificationRef.current = data;
        console.log("Waiting for private chat to load.");
        return;
      }

      pendingNotificationRef.current = null;
      selectChat(privateChat);

      return;
    }

    console.warn(
      "Unknown notification type:",
      data.type
    );
  },
  [user, loadMessageRequests]
);

// Register the handler with pushNotifications.js.
useEffect(() => {
  setNotificationTapHandler(handleNotificationTap);

  return () => {
    setNotificationTapHandler(null);
  };
}, [handleNotificationTap]);


useEffect(() => {
  const pending = pendingNotificationRef.current;

  if (!pending || !user) return;

  if (
    pending.type === "incoming_call" &&
    !socket?.connected
  ) {
    return;
  }

  handleNotificationTap(pending);
}, [chats, user, socket, socketStatus, handleNotificationTap]);


// =========================
// 37. LOG OUT
// =========================


async function handleLogout() {
  // 1. Remove this device's FCM token before clearing the session.
  try {
    await unregisterPushNotifications();
  } catch (error) {
    console.error(
      "FCM token cleanup failed:",
      error.message
    );
  }

  // 2. Log out from the backend.
  try {
    await api.logout();
  } catch (error) {
    console.error("API logout failed:", error);
  }

  // 3. Reset push registration tracking.
  pushRegistrationUserRef.current = null;

  // 4. Disconnect Socket.IO.
  socketRef.current?.disconnect();
  socketRef.current = null;

  setSocket(null);

  // 5. Clear authenticated user and chat data.
  setUser(null);
  setChats([]);
  setGroups([]);
  setActiveId("");
  setOnlineIds(new Set());

  // 6. Clear notification data.
  pendingNotificationRef.current = null;
  setMessageRequests([]);
  setShowMessageRequests(false);

  // 7. Reset interface state.
  setMobileChatOpen(false);
  setMenuOpen(false);
  setShowCreateGroup(false);
  setSelectedMemberIds([]);
  setGroupName("");

  // 8. Reset call state.
  cleanupCall();

  setActiveCall(null);
  setIncomingCall(null);
  setCallStatus("");
  setIsMuted(false);
  setIsCameraOff(false);
}



  // =========================
  // 38. CREATE GROUP
  // =========================

  async function handleCreateGroup(event) {
    event.preventDefault();

    const name = groupName.trim();

    if (name.length < 2 || name.length > 50) {
      setError(
        "Group name must be between 2 and 50 characters."
      );
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

      setGroups((previous) => [
        group,
        ...previous,
      ]);

      setChats((previous) => [
        newGroup,
        ...previous.filter(
          (chat) =>
            !(chat.isGroup && sameId(chat.id, group.id))
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
      setError(
        err.message || "Could not create the group."
      );
    } finally {
      setSavingGroup(false);
    }
  }

  // =========================
  // 39. DELETE GROUP
  // =========================

  async function handleDeleteGroup(group) {
    if (!group?.isGroup) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${group.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await api.deleteGroup(group.id);

      setChats((previous) =>
        previous.filter(
          (chat) => !sameId(chat.id, group.id)
        )
      );

      setGroups((previous) =>
        previous.filter(
          (item) => !sameId(item.id, group.id)
        )
      );

      if (sameId(activeId, group.id)) {
        setActiveId("");
        activeIdRef.current = "";
        setMobileChatOpen(false);
      }

      showNotice("Group deleted successfully.");
    } catch (err) {
      setError(
        err.message || "Could not delete the group."
      );
    }
  }

  // =========================
  // 40. LOADING SCREEN
  // =========================

  if (checkingSession) {
    return (
      <div className="full-loading">
        <LoaderCircle className="spin" size={28} />
        <span>Getting your chats ready...</span>
      </div>
    );
  }

  // =========================
  // 41. AUTHENTICATION SCREEN
  // =========================

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

  // =========================
  // 42. MAIN APPLICATION
  // =========================

  return (
    <main className="app-shell">

      {/* CHAT SIDEBAR */}
      <div
        className={
          mobileChatOpen ? "sidebar-hidden-mobile" : ""
        }
      >
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
        />
      </div>

      {/* CHAT PANEL */}
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
            {/* CHAT HEADER */}
<ChatHeader
  activeChat={activeChat}
  onlineIds={onlineIds}
  setMobileChatOpen={setMobileChatOpen}
  showNotice={showNotice}
  handleDeleteGroup={handleDeleteGroup}
  onOpenBackgroundPicker={openBackgroundPicker}
  onStartCall={handleStartCall}
  callStatus={callStatus}
  messageRequestCount={messageRequests.length}
  setShowMessageRequests={setShowMessageRequests}
/>
            {/* CHAT ERROR */}
            <ChatError
              error={error}
              onDismiss={() => setError("")}
            />

            {/* MESSAGES */}
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

            {/* REPLY PREVIEW */}
            <ReplyPreview
              replyTo={replyTo}
              onCancel={() => setReplyTo(null)}
            />

            {/* MESSAGE COMPOSER */}
            <MessageComposer
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
          /* EMPTY CHAT SCREEN */
          <div className="empty-chat-panel">
            <div className="welcome-icon">
              <MessageCircle size={28} />
            </div>

            <h2>Your conversations, all in one place.</h2>

            <p>
              Select someone from your people list or start a new
              conversation.
            </p>

            <button
              className="create-chat-submit"
              onClick={() => setShowNewChat(true)}
            >
              <Plus size={18} />
              Find people
            </button>
          </div>
        )}
      </section>

      {/* FIND PEOPLE MODAL */}
      <FindPeopleModal
        open={showNewChat}
        setOpen={setShowNewChat}
        newSearch={newSearch}
        setNewSearch={setNewSearch}
        searchResults={searchResults}
        selectChat={selectChat}
      />

      {/* SETTINGS MODAL */}
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

      {/* MESSAGE REQUESTS MODAL */}
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

      {/* CHAT BACKGROUND PICKER */}
      <ChatBackgroundPicker
        isOpen={backgroundPickerOpen}
        onClose={() => setBackgroundPickerOpen(false)}
        currentBackground={
          activeChat?.background || "default"
        }
        onSelect={handleBackgroundChange}
        saving={savingBackground}
      />

      {/* CREATE GROUP MODAL */}
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


<CallModal
  call={incomingCall || activeCall}
  localStream={localStream}
  remoteStream={remoteStream}
  connectionState={connectionState}
  mediaError={mediaError}
  isIncoming={Boolean(incomingCall)}
  isOutgoing={
    Boolean(activeCall && callStatus === "Calling...")
  }
  isMuted={isMuted}
  isCameraOff={isCameraOff}
  onAccept={() => handleAcceptIncoming()}
  onDecline={handleDeclineIncoming}
  onEnd={handleEndCall}
  onToggleMute={handleToggleMute}
  onToggleCamera={handleToggleCamera}
/>


      {/* NOTIFICATION TOASTS */}
      <NotificationToasts
        toast={toast}
        mentionToast={mentionToast}
        onDismissMention={() => setMentionToast(null)}
        mentionSuccessToast={mentionSuccessToast}
        onDismissMentionSuccess={() =>
          setMentionSuccessToast("")
        }
      />

    </main>
  );
}
