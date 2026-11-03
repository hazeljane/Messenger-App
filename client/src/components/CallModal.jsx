
import { useEffect, useRef } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  UserRound,
} from "lucide-react";
import "./CallModal.css";

export default function CallModal({
  call,
  localStream,
  remoteStream,
  connectionState = "idle",
  mediaError = "",
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleCamera,
  isMuted = false,
  isCameraOff = false,
  isIncoming = false,
  isOutgoing = false,
}) {
const localVideoRef = useRef(null);
const remoteVideoRef = useRef(null);
const remoteAudioRef = useRef(null);
// Display your local video.
useEffect(() => {
  const video = localVideoRef.current;

  if (!video) return;

  video.srcObject = localStream || null;

  if (localStream) {
    video.play().catch((error) => {
      console.warn("Local video playback:", error);
    });
  }
}, [localStream, isCameraOff]);

// Display the remote video.
useEffect(() => {
  const video = remoteVideoRef.current;

  if (!video) return;

  video.srcObject = remoteStream || null;

  if (remoteStream) {
    video.play().catch((error) => {
      console.warn("Remote video playback:", error);
    });
  }
}, [remoteStream]);

// Play remote audio.
useEffect(() => {
  const audio = remoteAudioRef.current;

  if (!audio) return;

  audio.srcObject = remoteStream || null;

  if (remoteStream) {
    audio.play().catch((error) => {
      console.warn("Remote audio playback:", error);
    });
  }
}, [remoteStream]);
  if (!call) return null;

  const isVideo = call.callType === "video";

  return (
    <div className="call-overlay">
      <section className="call-modal">
        <header className="call-modal-header">
          <span className="call-modal-label">
            {isIncoming
              ? "Incoming call"
              : isOutgoing
                ? "Calling..."
                : isVideo
                  ? "Video call"
                  : "Voice call"}
          </span>

       <button
  className="call-close-button"
  onClick={isIncoming ? onDecline : onEnd}
  aria-label={isIncoming ? "Decline call" : "End call"}
>
  <PhoneOff size={18} />
</button>
        </header>

        <div className={`call-media-area ${isVideo ? "video-call" : ""}`}>
          {!isVideo && (
  <audio
    ref={remoteAudioRef}
    autoPlay
  />
)}
          {isVideo && remoteStream ? (
            <video
              ref={remoteVideoRef}
              className="remote-video"
              autoPlay
              playsInline
              muted={false}
            />
          ) : (
            <div className="call-avatar">
              <UserRound size={48} />
            </div>
          )}
         
          {isVideo && localStream && (
            <video
              ref={localVideoRef}
              className="local-video"
              autoPlay
              muted
              playsInline
            />
          )}

          <div className="call-person-info">
            <h2>{call.displayName || "Chatterbox user"}</h2>
            <p>
              {mediaError ||
                (isIncoming
                  ? "Wants to connect with you"
                  : isOutgoing
                    ? "Waiting for an answer..."
                    : connectionState === "connected"
                      ? "Connected"
                      : "Connecting...")}
            </p>
          </div>
        </div>

        <footer className="call-controls">
          {isIncoming ? (
            <>
              <button
                className="call-action decline"
                onClick={onDecline}
                aria-label="Decline call"
              >
                <PhoneOff />
                <span>Decline</span>
              </button>

              <button
                className="call-action accept"
                onClick={onAccept}
                aria-label="Accept call"
              >
                <Phone />
                <span>Accept</span>
              </button>
            </>
          ) : (
            <>
              {!isOutgoing && (
                <>
                  <button
                    className={`call-action secondary ${isMuted ? "active" : ""}`}
                    onClick={onToggleMute}
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <MicOff /> : <Mic />}
                    <span>{isMuted ? "Unmute" : "Mute"}</span>
                  </button>

                  {isVideo && (
                    <button
                      className={`call-action secondary ${isCameraOff ? "active" : ""}`}
                      onClick={onToggleCamera}
                      aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
                    >
                      {isCameraOff ? <VideoOff /> : <Video />}
                      <span>{isCameraOff ? "Camera on" : "Camera off"}</span>
                    </button>
                  )}
                </>
              )}

              <button
                className="call-action decline"
                onClick={onEnd}
                aria-label="End call"
              >
                <PhoneOff />
                <span>End call</span>
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
