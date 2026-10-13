"use client";

import { useEffect, useSyncExternalStore } from "react";
import { setSoundOn, soundOn, startSounds, subscribeSound } from "@/lib/sound";

/** Binds UI sounds for the whole app. Mounted once, in Providers. */
export function SoundBinder() {
  useEffect(() => startSounds(), []);
  return null;
}

/** Round sound on/off button for the header. The server renders it as on. */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, soundOn, () => true);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Turn sounds off" : "Turn sounds on"}
      title={on ? "Sounds on" : "Sounds off"}
      onClick={() => setSoundOn(!on)}
      data-cuelume-toggle=""
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-nav border border-carbon bg-paper-white hover:bg-soft-mist"
    >
      <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        {on ? (
          <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
        ) : (
          <path d="M17 9l5 6M22 9l-5 6" />
        )}
      </svg>
    </button>
  );
}
