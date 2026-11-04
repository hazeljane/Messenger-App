
import { useEffect, useRef } from "react";

export default function useCallSounds({
  call,
  isIncoming,
  isOutgoing,
  connectionState,
}) {
  const ringtoneRef = useRef(null);

  useEffect(() => {
    if (!call) return;

    const shouldRing =
      (isIncoming || isOutgoing) &&
      connectionState !== "connected";

    if (!shouldRing) return;

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
    });

    return () => {
      ringtone.pause();
      ringtone.currentTime = 0;
      ringtoneRef.current = null;
    };
  }, [call, isIncoming, isOutgoing, connectionState]);

  // Stop ringtone manually if needed
  const stopRingtone = () => {
    if (!ringtoneRef.current) return;

    ringtoneRef.current.pause();
    ringtoneRef.current.currentTime = 0;
    ringtoneRef.current = null;
  };

  return { stopRingtone };
}
