"use client";

import { useEffect } from "react";
import { agentMode } from "@/lib/agentMode";
import { sound, startSounds } from "@/lib/sound";

/** Binds UI sounds for the whole app. Mounted once, in Providers. */
export function SoundBinder() {
  useEffect(() => startSounds(), []);
  return null;
}

const round =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-nav border border-carbon transition-colors";

/** Round sound on/off button for the header */
export function SoundToggle() {
  const on = sound.use();
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Turn sounds off" : "Turn sounds on"}
      title={on ? "Sounds on" : "Sounds off"}
      onClick={() => sound.set(!on)}
      data-cuelume-toggle=""
      className={`${round} bg-paper-white hover:bg-soft-mist`}
    >
      <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
      </svg>
    </button>
  );
}

/** Round agent-mode button for the header. Lavender when on. */
export function AgentToggle() {
  const on = agentMode.use();
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Turn agent mode off" : "Turn agent mode on"}
      title={on ? "Agent mode on: copy-for-agents buttons and agent briefs are showing" : "Agent mode off"}
      onClick={() => agentMode.set(!on)}
      data-cuelume-toggle=""
      className={`${round} ${on ? "bg-lavender" : "bg-paper-white hover:bg-soft-mist"}`}
    >
      <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="8" width="16" height="12" rx="4" fill={on ? "currentColor" : "none"} />
        <path d="M12 8V4M9 4h6" />
        <circle cx="9" cy="14" r="1.2" fill={on ? "var(--color-lavender)" : "currentColor"} stroke="none" />
        <circle cx="15" cy="14" r="1.2" fill={on ? "var(--color-lavender)" : "currentColor"} stroke="none" />
      </svg>
    </button>
  );
}

/** A labelled switch for agent mode, for the docs pages */
export function AgentModeSwitch() {
  const on = agentMode.use();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => agentMode.set(!on)}
      data-cuelume-toggle=""
      className="label-type inline-flex w-fit items-center gap-3 rounded-pills border border-carbon bg-paper-white py-1.5 pr-4 pl-1.5 text-[13px] uppercase hover:bg-soft-mist"
    >
      <span className={`flex h-7 w-12 items-center rounded-pills border border-carbon p-0.5 transition-colors ${on ? "bg-carbon" : "bg-soft-mist"}`}>
        <span className={`h-5.5 w-5.5 rounded-full border border-carbon bg-paper-white transition-transform ${on ? "translate-x-5" : ""}`} />
      </span>
      Agent mode {on ? "on" : "off"}
    </button>
  );
}
