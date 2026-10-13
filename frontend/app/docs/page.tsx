import Link from "next/link";
import { CopyForAgentsIndex } from "@/components/agents/AgentTools";
import { DocsShell } from "@/components/docs/DocsShell";
import { Sticker, type StickerKind } from "@/components/Stickers";
import { Badge, PageTitle } from "@/components/ui";
import { docPages } from "@/lib/agentDocs";

export const metadata = { title: "Docs — Veil", description: "How Veil works, for people and for AI agents." };

const stickers: Record<string, StickerKind> = { overview: "coin", agents: "star", contracts: "lock", api: "clock" };
const fills = ["bg-paper-white", "bg-lavender", "bg-paper-white", "bg-mint-pop"];

export default function DocsIndex() {
  return (
    <DocsShell>
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <Badge ghost>Docs</Badge>
          <PageTitle stickers={["star", "check"]}>How Veil works</PageTitle>
          <p className="max-w-2xl text-subheading">
            For people, and for the AI agents that help them. Agents are optional: turn on agent mode to copy any page
            for one.
          </p>
          <CopyForAgentsIndex />
        </div>
        <ul className="grid gap-4 md:grid-cols-2">
          {docPages().map((p, i) => (
            <li key={p.slug}>
              <Link
                href={`/docs/${p.slug}`}
                data-cuelume-navigate=""
                className={`relative flex h-full flex-col gap-3 rounded-cards-elevated border border-carbon p-6 hover:bg-soft-mist ${fills[i % fills.length]}`}
              >
                <Sticker kind={stickers[p.slug] ?? "star"} size={52} rotate={i % 2 ? 12 : -10} className="absolute -top-4 right-6" />
                <span className="text-heading-sm font-bold">{p.title}</span>
                <span className="text-carbon/70">{p.summary}</span>
                <span className="label-type mt-auto text-caption uppercase">Read →</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </DocsShell>
  );
}
