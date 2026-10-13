"use client";

import { useSyncExternalStore } from "react";

/*
 * Per-browser on/off preferences (sounds, agent mode). They live in localStorage, so they never
 * reach the server or other people. Every read and write survives blocked storage.
 */

export type Toggle = {
  get: () => boolean;
  set: (on: boolean) => void;
  subscribe: (listener: () => void) => () => void;
  /** React hook: the current value. The server renders the default. */
  use: () => boolean;
};

/**
 * Makes one stored on/off preference.
 * @param key localStorage key
 * @param fallback Value when nothing is stored, and on the server
 * @param onChange Runs after every set, e.g. to mute audio
 */
export function createToggle(key: string, fallback: boolean, onChange?: (on: boolean) => void): Toggle {
  const listeners = new Set<() => void>();
  const get = () => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v === "on";
    } catch {
      return fallback;
    }
  };
  const set = (on: boolean) => {
    try {
      localStorage.setItem(key, on ? "on" : "off");
    } catch {
      // Private mode or blocked storage: the choice lasts until reload
    }
    onChange?.(on);
    listeners.forEach((l) => l());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const use = () => useSyncExternalStore(subscribe, get, () => fallback);
  return { get, set, subscribe, use };
}
