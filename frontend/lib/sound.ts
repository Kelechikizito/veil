"use client";

import { bind, play, setEnabled, setVolume, type SoundName } from "cuelume";
import { createToggle } from "./prefs";

/*
 * UI sounds from Cuelume (synthesized with Web Audio, no files).
 * Elements opt in with data-cuelume-* attributes; outcomes call cue().
 */

/** Sounds on or off, per browser. On by default. */
export const sound = createToggle("veil-sound", true, setEnabled);

let started = false;

/** Wire every data-cuelume-* element once per page load */
export function startSounds() {
  if (started) return;
  started = true;
  setVolume(0.6);
  setEnabled(sound.get());
  bind();
}

/** Play an outcome cue: success, error, ready… Silent when sounds are off. */
export function cue(name: SoundName, emphasis?: "subtle" | "strong") {
  play(name, emphasis ? { emphasis } : undefined);
}
