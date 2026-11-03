
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================
// 1. WEBRTC CONFIGURATION
// ============================================

const ICE_SERVERS = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
    {
      urls: "stun:stun1.l.google.com:19302",
    },
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

  // Remote ICE candidates waiting for a peer connection
  // or remote description.
  const pendingCandidatesRef = useRef([]);

  // Local ICE candidates waiting for a call ID.
  const pendingLocalCandidatesRef = useRef([]);

  // Serialize addIceCandidate operations.
  const candidateQueueRef = useRef(Promise.resolve());

  // Prevent media streams from being kept after a cancelled call.
  const callGenerationRef = useRef(0);

  // ------------------------------------------
  // STATE
  // ------------------------------------------

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const [connectionState, setConnectionState] =
    useState("new");

  const [mediaError, setMediaError] = useState("");

  // ==========================================
  // 3. GET LOCAL CAMERA AND MICROPHONE
  // ==========================================

  const getLocalMedia = useCallback(async (callType) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera and microphone access is not supported by this browser. Use HTTPS or localhost."
      );
    }

    const isVideo = callType === "video";

    try {
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

      return stream;
    } catch (error) {
      let message = "Unable to access your camera or microphone.";

      if (error.name === "NotAllowedError") {
        message =
          "Camera or microphone permission was denied. Please allow access in your browser settings.";
      } else if (error.name === "NotFoundError") {
        message =
          "No camera or microphone was found on this device.";
      } else if (error.name === "NotReadableError") {
        message =
          "Your camera or microphone is already being used by another application.";
      } else if (error.name === "OverconstrainedError") {
        message =
          "The requested camera or microphone settings are not supported.";
      }

      setMediaError(message);
      throw new Error(message);
    }
  }, []);

  // ==========================================
  // 4. ADD REMOTE ICE CANDIDATE
  // ==========================================

  const addCandidate = useCallback((candidate) => {
    const peer = peerRef.current;

    if (!peer || !peer.remoteDescription) {
      return Promise.resolve();
    }

    // Keep candidate operations in order.
    candidateQueueRef.current =
      candidateQueueRef.current
        .catch(() => {})
        .then(async () => {
          const currentPeer = peerRef.current;

          if (!currentPeer || !currentPeer.remoteDescription) {
            return;
          }

          try {
            await currentPeer.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
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
  // 5. FLUSH WAITING REMOTE CANDIDATES
  // ==========================================

  const flushPendingCandidates = useCallback(async () => {
    const peer = peerRef.current;

    if (!peer || !peer.remoteDescription) {
      return;
    }

    const candidates = [
      ...pendingCandidatesRef.current,
    ];

    pendingCandidatesRef.current = [];

    for (const candidate of candidates) {
      await addCandidate(candidate);
    }
  }, [addCandidate]);

  // ==========================================
  // 6. SEND LOCAL ICE CANDIDATES
  // ==========================================

  const sendLocalCandidate = useCallback(
    (candidate) => {
      const { recipientId, callId } =
        callContextRef.current;

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
  // 7. SEND WAITING LOCAL CANDIDATES
  // ==========================================

  const flushLocalCandidates = useCallback(() => {
    const { recipientId, callId } =
      callContextRef.current;

    if (!socket || !recipientId || !callId) {
      return;
    }

    const candidates = [
      ...pendingLocalCandidatesRef.current,
    ];

    pendingLocalCandidatesRef.current = [];

    candidates.forEach((candidate) => {
      socket.emit("call:ice-candidate", {
        recipientId,
        callId,
        candidate,
      });
    });
  }, [socket]);

  // ==========================================
  // 8. CREATE PEER CONNECTION
  // ==========================================

  const createPeerConnection = useCallback(() => {
    // Reuse an existing connection if one exists.
    if (peerRef.current) {
      return peerRef.current;
    }

    const peer = new RTCPeerConnection(ICE_SERVERS);

    peerRef.current = peer;

    // ------------------------------------------
    // RECEIVE REMOTE MEDIA
    // ------------------------------------------

    peer.ontrack = (event) => {
      let stream = remoteStreamRef.current;

      if (!stream) {
        stream = new MediaStream();
        remoteStreamRef.current = stream;
      }

      // Add each incoming track only once.
      const alreadyAdded = stream
        .getTracks()
        .some((track) => track.id === event.track.id);

      if (!alreadyAdded) {
        stream.addTrack(event.track);
      }

      setRemoteStream(stream);
    };

    // ------------------------------------------
    // SEND LOCAL ICE CANDIDATES
    // ------------------------------------------

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendLocalCandidate(event.candidate.toJSON());
      }
    };

    // ------------------------------------------
    // CONNECTION STATE
    // ------------------------------------------

    peer.onconnectionstatechange = () => {
      if (peerRef.current !== peer) {
        return;
      }

      setConnectionState(peer.connectionState);

      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"
      ) {
        console.warn(
          "WebRTC connection state:",
          peer.connectionState
        );
      }
    };

    // ------------------------------------------
    // ICE CONNECTION STATE
    // ------------------------------------------

    peer.oniceconnectionstatechange = () => {
      if (peerRef.current !== peer) {
        return;
      }

      console.log(
        "ICE connection state:",
        peer.iceConnectionState
      );
    };

    return peer;
  }, [sendLocalCandidate]);

  // ==========================================
  // 9. SET CALL ID
  // ==========================================

  const setCallId = useCallback(
    (callId) => {
      callContextRef.current.callId = callId;

      // The caller may have gathered ICE candidates
      // before the server returned the call ID.
      flushLocalCandidates();
    },
    [flushLocalCandidates]
  );

  // ==========================================
  // 10. CREATE OFFER
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

        setConnectionState("new");
        setMediaError("");

        // Request microphone and optionally camera.
        const stream = await getLocalMedia(callType);

        // Stop if the call was cancelled while permission
        // was being requested.
        if (generation !== callGenerationRef.current) {
          stream.getTracks().forEach((track) => track.stop());

          throw new Error("Call was cancelled.");
        }

        const peer = createPeerConnection();

        // Add local audio/video tracks.
        stream.getTracks().forEach((track) => {
          peer.addTrack(track, stream);
        });

        // Create the offer.
        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        return peer.localDescription;
      } catch (error) {
        console.error("Create offer error:", error);

        if (generation === callGenerationRef.current) {
          setMediaError(error.message);
        }

        throw error;
      }
    },
    [getLocalMedia, createPeerConnection]
  );

  // ==========================================
  // 11. CREATE ANSWER
  // ==========================================

  const createAnswer = useCallback(
    async (
      callerId,
      callId,
      callType = "video",
      offer
    ) => {
      const generation = callGenerationRef.current;

      try {
        callContextRef.current = {
          recipientId: callerId,
          callId,
        };

// Preserve remote ICE candidates received while the call was ringing.
// Only reset local candidates for the new answer.
pendingLocalCandidatesRef.current = [];
candidateQueueRef.current = Promise.resolve();

        setConnectionState("new");
        setMediaError("");

        if (!offer) {
          throw new Error("The incoming call offer is missing.");
        }

        // Request local media.
        const stream = await getLocalMedia(callType);

        if (generation !== callGenerationRef.current) {
          stream.getTracks().forEach((track) => track.stop());

          throw new Error("Call was cancelled.");
        }

        const peer = createPeerConnection();

        // Add local tracks.
        stream.getTracks().forEach((track) => {
          peer.addTrack(track, stream);
        });

        // Apply the caller's offer.
        await peer.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        // Add candidates that arrived before the offer.
        await flushPendingCandidates();

        // Create the answer.
        const answer = await peer.createAnswer();

        await peer.setLocalDescription(answer);

        // Send any local candidates gathered so far.
        flushLocalCandidates();

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
      flushPendingCandidates,
      flushLocalCandidates,
    ]
  );

  // ==========================================
  // 12. HANDLE REMOTE ANSWER
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

        if (!answer) {
          throw new Error("The remote answer is missing.");
        }

        if (peer.remoteDescription) {
          console.warn(
            "Remote answer has already been applied."
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
  // 13. HANDLE REMOTE ICE CANDIDATE
  // ==========================================

  const handleRemoteCandidate = useCallback(
    async (candidate) => {
      if (!candidate) {
        return;
      }

      const peer = peerRef.current;

      // Candidate arrived before the peer connection
      // or before the remote description was ready.
      if (!peer || !peer.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }

      await addCandidate(candidate);
    },
    [addCandidate]
  );

  // ==========================================
  // 14. CLEAN UP CALL
  // ==========================================

  const cleanupCall = useCallback(() => {
    // Invalidate any pending getUserMedia operation.
    callGenerationRef.current += 1;

    // Close the peer connection.
    if (peerRef.current) {
      peerRef.current.ontrack = null;
      peerRef.current.onicecandidate = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.oniceconnectionstatechange = null;

      peerRef.current.close();
      peerRef.current = null;
    }

    // Stop camera and microphone.
    if (localStreamRef.current) {
      localStreamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      localStreamRef.current = null;
    }

    // Clear remote media references.
    if (remoteStreamRef.current) {
      remoteStreamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      remoteStreamRef.current = null;
    }

    // Clear waiting candidates.
    pendingCandidatesRef.current = [];
    pendingLocalCandidatesRef.current = [];

    candidateQueueRef.current = Promise.resolve();

    // Clear call information.
    callContextRef.current = {
      recipientId: null,
      callId: null,
    };

    // Reset UI state.
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState("new");
    setMediaError("");
  }, []);

  // ==========================================
  // 15. CLEAN UP WHEN COMPONENT UNMOUNTS
  // ==========================================

  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  // ==========================================
  // 16. RETURN HOOK VALUES AND FUNCTIONS
  // ==========================================

  return {
    // Media streams
    localStream,
    remoteStream,

    // Connection information
    connectionState,
    mediaError,

    // Call setup
    createOffer,
    createAnswer,
    setCallId,

    // Remote WebRTC events
    handleRemoteAnswer,
    handleRemoteCandidate,

    // Cleanup
    cleanupCall,
  };
}
