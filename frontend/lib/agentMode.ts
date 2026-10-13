"use client";

import { createToggle } from "./prefs";

/*
 * Agent mode: optional tools for people who work with an AI agent. Off by default.
 * When on, the app shows "Copy for agents" buttons and ready-made agent briefs. Veil works fully without it.
 * Read-only endpoints (/llms.txt, /api/credential, /api/org) and /sign work either way: they're public.
 */
export const agentMode = createToggle("veil-agent-mode", false);
