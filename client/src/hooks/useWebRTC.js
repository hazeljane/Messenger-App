import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// ============================================
// 1. WEBRTC CONFIGURATION
// ============================================

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// ============================================
// 2. WEBRTC HOOK
// ============================================

export default function useWebRTC(socket) {
  const peerRef = useRef(null);

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);

  const callContextRef = useRef({
    recipientId: null,
    callId: null,
  });

  const pendingCandidatesRef = useRef([]);
  const pendingLocalCandidatesRef = useRef([]);

  const candidateQueueRef = useRef(Promise.resolve());

  const callGenerationRef = useRef(0);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const [connectionState, setConnectionState] = useState("idle");
  const [mediaError, setMediaError] = useState("");

  // ==========================================
  // 3. STOP STREAM
  // ==========================================

  const stopStream = useCallback((stream) => {
    if (!stream) return;

    stream.getTracks().forEach((track) => {
      track.stop();
    });
  }, []);

  // ==========================================
  // 4. GET LOCAL MEDIA
  // ==========================================

  const getLocalMedia = useCallback(async (callType) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera and microphone access is not supported. Use HTTPS or localhost."
      );
    }

    const isVideo = callType === "video";

    try {
      console.log("Requesting local media:", {
        callType,
        videoEnabled: isVideo,
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo
          ? {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaError("");

      console.log(
        "Local media tracks:",
        stream.getTracks().map((track) => ({
          kind: track.kind,
          enabled: track.enabled,
          readyState: track.readyState,
        }))
      );

      return stream;
    } catch (error) {
      let message = "Unable to access your camera or microphone.";

      if (error.name === "NotAllowedError") {
        message =
          "Camera or microphone permission was denied. Allow access in your device settings.";
      } else if (error.name === "NotFoundError") {
        message =
          "No camera or microphone was found on this device.";
      } else if (error.name === "NotReadableError") {
        message =
          "Your camera or microphone is already being used by another application.";
      } else if (error.name === "OverconstrainedError") {
        message =
          "The requested camera settings are not supported.";
      }

      setMediaError(message);
      console.error("Local media error:", error);

      throw new Error(message);
    }
  }, []);

  // ==========================================
  // 5. ADD REMOTE ICE CANDIDATE
  // ==========================================

  const addCandidate = useCallback((candidate) => {
    candidateQueueRef.current = candidateQueueRef.current
      .catch(() => {})
      .then(async () => {
        const peer = peerRef.current;

        if (!peer || !peer.remoteDescription) {
          pendingCandidatesRef.current.push(candidate);
          return;
        }

        try {
          await peer.addIceCandidate(
            new RTCIceCandidate(candidate)
          );

          console.log("Remote ICE candidate added.");
        } catch (error) {
          console.error(
            "Error adding remote ICE candidate:",
            error
          );
        }
      });

    return candidateQueueRef.current;
  }, []);

  // ==========================================
  // 6. FLUSH REMOTE ICE CANDIDATES
  // ==========================================

  const flushPendingCandidates = useCallback(async () => {
    const peer = peerRef.current;

    if (!peer || !peer.remoteDescription) return;

    const candidates = [...pendingCandidatesRef.current];

    pendingCandidatesRef.current = [];

    for (const candidate of candidates) {
      await addCandidate(candidate);
    }

    await candidateQueueRef.current;
  }, [addCandidate]);

  // ==========================================
  // 7. SEND LOCAL ICE CANDIDATE
  // ==========================================

  const sendLocalCandidate = useCallback(
    (candidate) => {
      const { recipientId, callId } = callContextRef.current;

      if (!socket || !recipientId || !callId) {
        pendingLocalCandidatesRef.current.push(candidate);
        return;
      }

      socket.emit("call:ice-candidate", {
        recipientId,
        callId,
        candidate,
      });
    },
    [socket]
  );

  // ==========================================
  // 8. FLUSH LOCAL ICE CANDIDATES
  // ==========================================

  const flushLocalCandidates = useCallback(() => {
    const { recipientId, callId } = callContextRef.current;

    if (!socket || !recipientId || !callId) return;

    const candidates = [...pendingLocalCandidatesRef.current];

    pendingLocalCandidatesRef.current = [];

    candidates.forEach((candidate) => {
      socket.emit("call:ice-candidate", {
        recipientId,
        callId,
        candidate,
      });
    });

    console.log(
      "Pending local ICE candidates sent:",
      candidates.length
    );
  }, [socket]);

  // ==========================================
  // 9. CREATE PEER CONNECTION
  // ==========================================

  const createPeerConnection = useCallback(() => {
    if (peerRef.current) {
      if (
        peerRef.current.connectionState !== "closed"
      ) {
        throw new Error(
          "A peer connection already exists. Clean up the previous call first."
        );
      }

      peerRef.current = null;
    }

    const peer = new RTCPeerConnection(ICE_SERVERS);

    peerRef.current = peer;

    // RECEIVE REMOTE MEDIA

    peer.ontrack = (event) => {
      if (peerRef.current !== peer) return;

      let stream = remoteStreamRef.current;

      if (event.streams?.[0]) {
        stream = event.streams[0];
      } else {
        if (!stream) {
          stream = new MediaStream();
        }

        const alreadyAdded = stream
          .getTracks()
          .some((track) => track.id === event.track.id);

        if (!alreadyAdded) {
          stream.addTrack(event.track);
        }
      }

      remoteStreamRef.current = stream;
      setRemoteStream(stream);

      console.log("Remote track received:", {
        kind: event.track.kind,
        readyState: event.track.readyState,
        enabled: event.track.enabled,
      });
    };

    // SEND LOCAL ICE

    peer.onicecandidate = (event) => {
      if (peerRef.current !== peer) return;

      if (event.candidate) {
        sendLocalCandidate(event.candidate.toJSON());
      }
    };

    // CONNECTION STATE

    peer.onconnectionstatechange = () => {
      if (peerRef.current !== peer) return;

      console.log(
        "Peer connection state:",
        peer.connectionState
      );

      setConnectionState(peer.connectionState);
    };

    // ICE STATE

    peer.oniceconnectionstatechange = () => {
      if (peerRef.current !== peer) return;

      console.log(
        "ICE connection state:",
        peer.iceConnectionState
      );

      if (peer.iceConnectionState === "failed") {
        console.error(
          "ICE connection failed. A TURN server may be required."
        );
      }
    };

    peer.onicegatheringstatechange = () => {
      if (peerRef.current !== peer) return;

      console.log(
        "ICE gathering state:",
        peer.iceGatheringState
      );
    };

    peer.onicecandidateerror = (event) => {
      console.error("ICE candidate error:", {
        url: event.url,
        errorCode: event.errorCode,
        errorText: event.errorText,
      });
    };

    return peer;
  }, [sendLocalCandidate]);

  // ==========================================
  // 10. ADD LOCAL TRACKS
  // ==========================================

  const addLocalTracks = useCallback((peer, stream) => {
    stream.getTracks().forEach((track) => {
      peer.addTrack(track, stream);

      console.log("Local track added:", {
        kind: track.kind,
        enabled: track.enabled,
      });
    });
  }, []);

  // ==========================================
  // 11. SET CALL ID
  // ==========================================

  const setCallId = useCallback(
    (callId) => {
      callContextRef.current.callId = callId;

      flushLocalCandidates();
    },
    [flushLocalCandidates]
  );

  // ==========================================
  // 12. RESET CALL STATE
  // ==========================================

  const resetCallState = useCallback(() => {
    pendingCandidatesRef.current = [];
    pendingLocalCandidatesRef.current = [];

    candidateQueueRef.current = Promise.resolve();

    remoteStreamRef.current = null;

    setRemoteStream(null);
    setConnectionState("new");
    setMediaError("");
  }, []);

  // ==========================================
  // 13. CREATE OFFER - CALLER
  // ==========================================

  const createOffer = useCallback(
    async (recipientId, callType = "video") => {
      const generation = callGenerationRef.current;

      try {
        if (!["audio", "video"].includes(callType)) {
          throw new Error("Invalid call type.");
        }

        if (peerRef.current) {
          throw new Error(
            "Another call is already being prepared."
          );
        }

        callContextRef.current = {
          recipientId,
          callId: null,
        };

        resetCallState();

        const stream = await getLocalMedia(callType);

        if (generation !== callGenerationRef.current) {
          stopStream(stream);
          throw new Error("Call was cancelled.");
        }

        const peer = createPeerConnection();

        addLocalTracks(peer, stream);

        const offer = await peer.createOffer();

        if (generation !== callGenerationRef.current) {
          throw new Error("Call was cancelled.");
        }

        await peer.setLocalDescription(offer);

        if (generation !== callGenerationRef.current) {
          throw new Error("Call was cancelled.");
        }

        const result = peer.localDescription;

        if (!result?.sdp) {
          throw new Error("Could not generate WebRTC offer.");
        }

        console.log("WebRTC offer created:", {
          type: result.type,
          hasSdp: Boolean(result.sdp),
          callType,
        });

        return result;
      } catch (error) {
        console.error("Create offer error:", error);

        if (generation === callGenerationRef.current) {
          setMediaError(error.message);
        }

        throw error;
      }
    },
    [
      resetCallState,
      getLocalMedia,
      createPeerConnection,
      addLocalTracks,
      stopStream,
    ]
  );

  // ==========================================
  // 14. CREATE ANSWER - RECEIVER
  // ==========================================

  const createAnswer = useCallback(
    async (callerId, callId, callType = "video", offer) => {
      const generation = callGenerationRef.current;
console.log("CREATE ANSWER INPUT CHECK:", {
  callerId,
  callId,
  callType,
  hasOffer: Boolean(offer),
  offerType: offer?.type,
  hasSdp: Boolean(offer?.sdp),
  sdpLength: offer?.sdp?.length || 0,
});
      try {
        if (!["audio", "video"].includes(callType)) {
          throw new Error("Invalid call type.");
        }

        // Validate offer BEFORE requesting media.

        if (
          !offer ||
          offer.type !== "offer" ||
          typeof offer.sdp !== "string" ||
          !offer.sdp.trim()
        ) {
          throw new Error(
            "The incoming call offer is missing or invalid."
          );
        }

        if (peerRef.current) {
          throw new Error(
            "Another peer connection already exists."
          );
        }

        callContextRef.current = {
          recipientId: callerId,
          callId,
        };

        resetCallState();

        const stream = await getLocalMedia(callType);

        if (generation !== callGenerationRef.current) {
          stopStream(stream);
          throw new Error("Call was cancelled.");
        }

        const peer = createPeerConnection();

        addLocalTracks(peer, stream);

        await peer.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        if (generation !== callGenerationRef.current) {
          throw new Error("Call was cancelled.");
        }

        await flushPendingCandidates();

        const answer = await peer.createAnswer();

        await peer.setLocalDescription(answer);

        if (generation !== callGenerationRef.current) {
          throw new Error("Call was cancelled.");
        }

        flushLocalCandidates();

        const result = peer.localDescription;

        if (!result?.sdp) {
          throw new Error("Could not generate WebRTC answer.");
        }

        console.log("WebRTC answer created:", {
          type: result.type,
          hasSdp: Boolean(result.sdp),
          callType,
        });

        return result;
      } catch (error) {
        console.error("Create answer error:", error);

        if (generation === callGenerationRef.current) {
          setMediaError(error.message);
        }

        throw error;
      }
    },
    [
      resetCallState,
      getLocalMedia,
      createPeerConnection,
      addLocalTracks,
      flushPendingCandidates,
      flushLocalCandidates,
      stopStream,
    ]
  );

  // ==========================================
  // 15. HANDLE REMOTE ANSWER
  // ==========================================

  const handleRemoteAnswer = useCallback(
    async (answer) => {
      try {
        const peer = peerRef.current;

        if (!peer) {
          throw new Error(
            "Peer connection does not exist."
          );
        }

        if (
          !answer ||
          answer.type !== "answer" ||
          typeof answer.sdp !== "string" ||
          !answer.sdp.trim()
        ) {
          throw new Error("The remote answer is invalid.");
        }

        if (peer.remoteDescription) {
          console.warn(
            "Remote description has already been applied."
          );
          return;
        }

        await peer.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        await flushPendingCandidates();

        console.log("Remote answer applied successfully.");
      } catch (error) {
        console.error(
          "Error handling remote answer:",
          error
        );

        setMediaError(error.message);

        throw error;
      }
    },
    [flushPendingCandidates]
  );

  // ==========================================
  // 16. HANDLE REMOTE ICE CANDIDATE
  // ==========================================

  const handleRemoteCandidate = useCallback(
    async (candidate) => {
      if (!candidate) return;

      const peer = peerRef.current;

      if (!peer || !peer.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);

        console.log("Remote ICE candidate queued.");

        return;
      }

      await addCandidate(candidate);
    },
    [addCandidate]
  );

  // ==========================================
  // 17. CLEAN UP CALL
  // ==========================================

  const cleanupCall = useCallback(() => {
    callGenerationRef.current += 1;

    if (peerRef.current) {
      peerRef.current.ontrack = null;
      peerRef.current.onicecandidate = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.oniceconnectionstatechange = null;
      peerRef.current.onicegatheringstatechange = null;
      peerRef.current.onicecandidateerror = null;

      peerRef.current.close();
      peerRef.current = null;
    }

    stopStream(localStreamRef.current);
    localStreamRef.current = null;

    stopStream(remoteStreamRef.current);
    remoteStreamRef.current = null;

    pendingCandidatesRef.current = [];
    pendingLocalCandidatesRef.current = [];

    candidateQueueRef.current = Promise.resolve();

    callContextRef.current = {
      recipientId: null,
      callId: null,
    };

    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState("idle");
    setMediaError("");

    console.log("Call cleaned up.");
  }, [stopStream]);

  // ==========================================
  // 18. CLEAN UP WHEN UNMOUNTED
  // ==========================================

  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  // ==========================================
  // 19. RETURN VALUES
  // ==========================================

  return {
    localStream,
    remoteStream,

    connectionState,
    mediaError,

    createOffer,
    createAnswer,
    setCallId,

    handleRemoteAnswer,
    handleRemoteCandidate,

    cleanupCall,
  };
}