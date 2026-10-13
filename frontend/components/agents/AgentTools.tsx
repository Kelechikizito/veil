"use client";

import { useState, type ReactNode } from "react";
import { agentMode } from "@/lib/agentMode";
import { docPages } from "@/lib/agentDocs";
import { cue } from "@/lib/sound";
import { Sticker } from "../Stickers";
import { AgentModeSwitch } from "../Toggles";
import { Button } from "../ui";

/** Copies text, plays the success cue, and says "Copied" for a moment */
export function CopyButton({ text, label, variant = "outline" }: { text: () => string; label: string; variant?: "dark" | "outline" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      onClick={() =>
        void navigator.clipboard.writeText(text()).then(() => {
          cue("success", "subtle");
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        })
      }
      className="!px-4 !py-2.5 text-caption"
    >
      {copied ? "Copied ✓" : label}
    </Button>
  );
}

/**
 * The docs page's agent bar. Agent mode on: copy the page as Markdown, with absolute links, or its .md URL.
 * Off: a short note and the switch, since agents are optional.
 */
export function CopyForAgents({ slug }: { slug: string }) {
  const on = agentMode.use();
  if (!on) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-caption text-carbon/70">
        <AgentModeSwitch />
        <span>Turn on to copy this page for an AI agent.</span>
      </div>
    );
  }
  const origin = () => window.location.origin;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyButton variant="dark" label="Copy for agents" text={() => docPages(origin()).find((p) => p.slug === slug)?.markdown ?? ""} />
      <CopyButton label="Copy .md link" text={() => `${origin()}/llms/${slug}.md`} />
      <CopyButton label="Copy llms.txt link" text={() => `${origin()}/llms.txt`} />
    </div>
  );
}

/** The docs index's agent bar: copy every page at once, or the llms.txt link */
export function CopyForAgentsIndex() {
  const on = agentMode.use();
  if (!on) return <AgentModeSwitch />;
  const origin = () => window.location.origin;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AgentModeSwitch />
      <CopyButton
        variant="dark"
        label="Copy all docs for agents"
        text={() =>
          docPages(origin())
            .map((p) => p.markdown)
            .join("\n\n---\n\n")
        }
      />
      <CopyButton label="Copy llms.txt link" text={() => `${origin()}/llms.txt`} />
    </div>
  );
}

export type Brief = { title: string; body: string; prompt: string };

/**
 * Ready-made agent briefs for one screen, shown only in agent mode.
 * Each brief is a prompt the person pastes into their agent. It never contains keys.
 */
export function AgentBriefs({ heading, briefs, children }: { heading: string; briefs: Brief[]; children?: ReactNode }) {
  const on = agentMode.use();
  if (!on) return null;
  return (
    <section className="relative flex flex-col gap-5 rounded-cards-elevated border border-carbon bg-lavender p-6 md:p-8">
      <Sticker kind="star" size={52} rotate={14} className="absolute -top-5 right-6" />
      <header className="flex flex-col gap-1">
        <span className="label-type text-caption uppercase">Agent mode</span>
        <h2 className="text-subheading font-bold">{heading}</h2>
        <p className="max-w-2xl text-caption text-carbon/70">
          Paste a brief into your AI agent. It reads the chain and sends you a link to review and sign. It never gets your
          keys.
        </p>
      </header>
      <ul className="grid gap-3 md:grid-cols-2">
        {briefs.map((b) => (
          <li key={b.title} className="flex flex-col gap-3 rounded-cards border border-carbon bg-paper-white p-5">
            <h3 className="font-bold">{b.title}</h3>
            <p className="flex-1 text-caption text-carbon/70">{b.body}</p>
            <div>
              <CopyButton label="Copy brief" text={() => b.prompt} />
            </div>
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}
