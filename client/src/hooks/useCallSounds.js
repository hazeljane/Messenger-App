
import { useEffect, useRef, useCallback } from "react";

export default function useCallSounds({
  call,
  isIncoming,
  isOutgoing,
  connectionState,
}) {
  const ringtoneRef = useRef(null);

  const stopRingtone = useCallback(() => {
    const ringtone = ringtoneRef.current;

    if (!ringtone) return;

    ringtone.pause();
    ringtone.currentTime = 0;
    ringtoneRef.current = null;
  }, []);

  useEffect(() => {
    if (!call) {
      stopRingtone();
      return;
    }

    const shouldRing =
      (isIncoming || isOutgoing) &&
      connectionState !== "connected";

    if (!shouldRing) {
      stopRingtone();
      return;
    }

    const ringtone = new Audio(
      isIncoming
        ? "/sounds/incoming-ringtone.mp3"
        : "/sounds/outgoing-ringtone.mp3"
    );

    ringtone.loop = true;
    ringtone.volume = 0.7;
    ringtoneRef.current = ringtone;

    ringtone.play().catch((error) => {
      console.warn("Ringtone playback failed:", error);
      console.warn(
        "Check browser audio permissions and MP3 file paths."
      );
    });

    return () => {
      ringtone.pause();
      ringtone.currentTime = 0;

      if (ringtoneRef.current === ringtone) {
        ringtoneRef.current = null;
      }
    };
  }, [
    call,
    isIncoming,
    isOutgoing,
    connectionState,
    stopRingtone,
  ]);

  return { stopRingtone };
}
