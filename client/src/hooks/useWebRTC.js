
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
  // ------------------------------------------
  // REFERENCES
  // ------------------------------------------

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

  // Identifies the current call and prevents stale operations.
  const callGenerationRef = useRef(0);

  // ------------------------------------------
  // STATE
  // ------------------------------------------

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const [connectionState, setConnectionState] = useState("idle");
  const [mediaError, setMediaError] = useState("");

  // ==========================================
  // 3. STOP A STREAM
  // ==========================================

  const stopStream = useCallback((stream) => {
    if (!stream) return;

    stream.getTracks().forEach((track) => {
      track.stop();
    });
  }, []);

  // ==========================================
  // 4. GET LOCAL CAMERA AND MICROPHONE
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
          "Camera or microphone permission was denied. Allow access in your browser settings.";
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
        console.error("Error adding remote ICE candidate:", error);
      }
    });

  return candidateQueueRef.current;
}, []);

  // ==========================================
  // 6. FLUSH PENDING REMOTE CANDIDATES
  // ==========================================

  const flushPendingCandidates = useCallback(async () => {
    const peer = peerRef.current;

    if (!peer || !peer.remoteDescription) {
      return;
    }

    const candidates = [...pendingCandidatesRef.current];

    pendingCandidatesRef.current = [];

    for (const candidate of candidates) {
      await addCandidate(candidate);
    }

    await candidateQueueRef.current;
  }, [addCandidate]);

  // ==========================================
  // 7. SEND LOCAL ICE CANDIDATES
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

    if (!socket || !recipientId || !callId) {
      return;
    }

    const candidates = [...pendingLocalCandidatesRef.current];

    pendingLocalCandidatesRef.current = [];

    candidates.forEach((candidate) => {
      socket.emit("call:ice-candidate", {
        recipientId,
        callId,
        candidate,
      });
    });

    console.log("Pending local ICE candidates sent:", candidates.length);
  }, [socket]);

  // ==========================================
  // 9. CREATE PEER CONNECTION
  // ==========================================

  const createPeerConnection = useCallback(() => {
    if (peerRef.current) {
      return peerRef.current;
    }

    const peer = new RTCPeerConnection(ICE_SERVERS);

    peerRef.current = peer;

    // ------------------------------------------
    // RECEIVE REMOTE AUDIO AND VIDEO
    // ------------------------------------------

peer.ontrack = (event) => {
  if (peerRef.current !== peer) return;

  let stream = remoteStreamRef.current;

  // Prefer the stream provided by the browser.
  if (event.streams?.[0]) {
    stream = event.streams[0];
  } else {
    // Fallback: create a stream and add tracks manually.
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
    streamTracks: stream.getTracks().map((track) => ({
      kind: track.kind,
      readyState: track.readyState,
    })),
  });

  event.track.onended = () => {
    console.log("Remote track ended:", event.track.kind);
  };
};

    // ------------------------------------------
    // SEND LOCAL ICE CANDIDATES
    // ------------------------------------------

    peer.onicecandidate = (event) => {
      if (peerRef.current !== peer) return;

      if (event.candidate) {
        sendLocalCandidate(event.candidate.toJSON());
      }
    };

    // ------------------------------------------
    // CONNECTION STATE
    // ------------------------------------------

    peer.onconnectionstatechange = () => {
      if (peerRef.current !== peer) return;

      console.log("Peer connection state:", peer.connectionState);

      setConnectionState(peer.connectionState);
    };

    // ------------------------------------------
    // ICE CONNECTION STATE
    // ------------------------------------------

    peer.oniceconnectionstatechange = () => {
      if (peerRef.current !== peer) return;

      console.log("ICE connection state:", peer.iceConnectionState);

      if (peer.iceConnectionState === "failed") {
        console.error(
          "ICE connection failed. A TURN server may be required."
        );
      }
    };

    // ------------------------------------------
    // ICE GATHERING STATE
    // ------------------------------------------

    peer.onicegatheringstatechange = () => {
      if (peerRef.current !== peer) return;

      console.log("ICE gathering state:", peer.iceGatheringState);
    };

    // ------------------------------------------
    // ICE CANDIDATE ERRORS
    // ------------------------------------------

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
  // 10. ADD LOCAL TRACKS TO PEER
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
  // 12. CREATE OFFER - CALLER
  // ==========================================

  const createOffer = useCallback(
    async (recipientId, callType = "video") => {
      const generation = callGenerationRef.current;

      try {
        callContextRef.current = {
          recipientId,
          callId: null,
        };

        pendingCandidatesRef.current = [];
        pendingLocalCandidatesRef.current = [];
        candidateQueueRef.current = Promise.resolve();

        remoteStreamRef.current = null;
        setRemoteStream(null);

        setConnectionState("new");
        setMediaError("");

        // Get the caller's camera and microphone.
        const stream = await getLocalMedia(callType);

        // Check whether the call was cancelled.
        if (generation !== callGenerationRef.current) {
          stopStream(stream);

          if (localStreamRef.current === stream) {
            localStreamRef.current = null;
            setLocalStream(null);
          }

          throw new Error("Call was cancelled.");
        }

        const peer = createPeerConnection();

        // Add caller's audio and video tracks.
        addLocalTracks(peer, stream);

        // Create the offer.
        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        console.log("Video/audio offer created:", {
          callType,
          tracks: stream.getTracks().map((track) => track.kind),
        });

        return peer.localDescription;
      } catch (error) {
        console.error("Create offer error:", error);

        if (generation === callGenerationRef.current) {
          setMediaError(error.message);
        }

        throw error;
      }
    },
    [
      getLocalMedia,
      createPeerConnection,
      addLocalTracks,
      stopStream,
    ]
  );

  // ==========================================
  // 13. CREATE ANSWER - RECEIVER
  // ==========================================

  const createAnswer = useCallback(
    async (callerId, callId, callType = "video", offer) => {
      const generation = callGenerationRef.current;

      try {
        callContextRef.current = {
          recipientId: callerId,
          callId,
        };

        // Preserve remote ICE candidates received while ringing.
        pendingLocalCandidatesRef.current = [];
        candidateQueueRef.current = Promise.resolve();

        remoteStreamRef.current = null;
        setRemoteStream(null);

        setConnectionState("new");
        setMediaError("");

        if (!offer) {
          throw new Error("The incoming call offer is missing.");
        }

        // Get the receiver's own camera and microphone.
        const stream = await getLocalMedia(callType);

        // Check whether the call was cancelled.
        if (generation !== callGenerationRef.current) {
          stopStream(stream);

          if (localStreamRef.current === stream) {
            localStreamRef.current = null;
            setLocalStream(null);
          }

          throw new Error("Call was cancelled.");
        }

        const peer = createPeerConnection();

        // Add receiver's audio and video tracks.
        addLocalTracks(peer, stream);

        // Apply caller's offer.
        await peer.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        // Add remote ICE candidates received before the offer.
        await flushPendingCandidates();

        // Create answer.
        const answer = await peer.createAnswer();

        await peer.setLocalDescription(answer);

        // Send local ICE candidates.
        flushLocalCandidates();

        console.log("Video/audio answer created:", {
          callType,
          tracks: stream.getTracks().map((track) => track.kind),
        });

        return peer.localDescription;
      } catch (error) {
        console.error("Create answer error:", error);

        if (generation === callGenerationRef.current) {
          setMediaError(error.message);
        }

        throw error;
      }
    },
    [
      getLocalMedia,
      createPeerConnection,
      addLocalTracks,
      flushPendingCandidates,
      flushLocalCandidates,
      stopStream,
    ]
  );

  // ==========================================
  // 14. HANDLE REMOTE ANSWER
  // ==========================================

  const handleRemoteAnswer = useCallback(
    async (answer) => {
      try {
        const peer = peerRef.current;

        if (!peer) {
          throw new Error("Peer connection does not exist.");
        }

        if (!answer) {
          throw new Error("The remote answer is missing.");
        }

        if (peer.remoteDescription) {
          console.warn("Remote answer has already been applied.");
          return;
        }

        await peer.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        await flushPendingCandidates();

        console.log("Remote answer applied successfully.");
      } catch (error) {
        console.error("Error handling remote answer:", error);

        setMediaError(error.message);
        throw error;
      }
    },
    [flushPendingCandidates]
  );

  // ==========================================
  // 15. HANDLE REMOTE ICE CANDIDATE
  // ==========================================

  const handleRemoteCandidate = useCallback(
    async (candidate) => {
      if (!candidate) return;

      const peer = peerRef.current;

      // Save candidates received before the remote description.
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
  // 16. CLEAN UP CALL
  // ==========================================

  const cleanupCall = useCallback(() => {
    // Invalidate pending media requests and async operations.
    callGenerationRef.current += 1;

    // Close peer connection.
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

    // Stop local camera and microphone.
    stopStream(localStreamRef.current);
    localStreamRef.current = null;

    // Stop remote media tracks.
    stopStream(remoteStreamRef.current);
    remoteStreamRef.current = null;

    // Clear candidate queues.
    pendingCandidatesRef.current = [];
    pendingLocalCandidatesRef.current = [];

    candidateQueueRef.current = Promise.resolve();

    // Clear call information.
    callContextRef.current = {
      recipientId: null,
      callId: null,
    };

    // Reset UI.
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState("idle");
    setMediaError("");

    console.log("Call cleaned up.");
  }, [stopStream]);

  // ==========================================
  // 17. CLEAN UP WHEN HOOK UNMOUNTS
  // ==========================================

  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  // ==========================================
  // 18. RETURN VALUES
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
