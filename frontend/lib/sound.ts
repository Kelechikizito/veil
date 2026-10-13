"use client";

import { bind, play, setEnabled, setVolume, type SoundName } from "cuelume";

/*
 * UI sounds from Cuelume (synthesized with Web Audio, no files).
 * Elements opt in with data-cuelume-* attributes; outcomes call cue().
 * The on/off choice is per browser, so it lives in localStorage.
 */

const KEY = "veil-sound";
const listeners = new Set<() => void>();

/** Whether sounds are on. On by default. */
export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

/** Turn sounds on or off, remember it, and tell the toggles */
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Private mode or blocked storage: the choice lasts until reload
  }
  setEnabled(on);
  listeners.forEach((l) => l());
}

/** For useSyncExternalStore */
export function subscribeSound(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let started = false;

/** Wire every data-cuelume-* element once per page load */
export function startSounds() {
  if (started) return;
  started = true;
  setVolume(0.6);
  setEnabled(soundOn());
  bind();
}

/** Play an outcome cue: success, error, ready… Silent when sounds are off. */
export function cue(name: SoundName, emphasis?: "subtle" | "strong") {
  play(name, emphasis ? { emphasis } : undefined);
}
