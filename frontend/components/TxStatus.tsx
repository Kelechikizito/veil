"use client";

import { useAccount } from "wagmi";
import { chainFor } from "@/lib/chains";
import { useTxLog } from "@/lib/txLog";

export type TxStage = "idle" | "signing" | "confirming" | "done" | "error";

/** The working stages, in order */
const STAGES: { stage: Exclude<TxStage, "idle" | "done" | "error">; label: string; help: string }[] = [
  { stage: "signing", label: "Signing", help: "Confirm in your wallet." },
  { stage: "confirming", label: "Confirming", help: "Waiting for the transaction to land." },
];

/**
 * Progress for a transaction: signing → confirming → done | error.
 * Flat, ink-only: the current stage is outlined, finished ones are filled.
 */
export function TxStatus({ stage, error, txHash }: { stage: TxStage; error?: string; txHash?: string }) {
  if (stage === "idle") return null;
  const currentIndex = STAGES.findIndex((s) => s.stage === stage);
  const finished = stage === "done";

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4 rounded-cards border border-carbon bg-paper-white p-6">
      <ol className="grid grid-cols-2 gap-2">
        {STAGES.map((s, i) => {
          const done = finished || (currentIndex !== -1 && i < currentIndex);
          const current = i === currentIndex;
          return (
            <li key={s.stage} className="flex flex-col gap-2">
              <span
                className={`h-1.5 rounded-pills ${
                  done ? "bg-carbon" : current ? "animate-pulse bg-carbon/60" : "bg-carbon/10"
                }`}
              />
              <span className={`text-caption ${done || current ? "" : "text-carbon/55"}`}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-caption">
        {stage === "error"
          ? `Something went wrong: ${error ?? "unknown error"}`
          : finished
            ? "Done."
            : STAGES[currentIndex]?.help}
      </p>
      {txHash && <ExplorerLink hash={txHash} label="View on" />}
    </div>
  );
}

/** A link to the transaction on the explorer of the wallet's current chain */
function ExplorerLink({ hash, label }: { hash: string; label?: string }) {
  const { chainId } = useAccount();
  const explorer = chainFor(chainId).blockExplorers.default;
  return (
    <a
      href={`${explorer.url}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-caption underline underline-offset-4"
    >
      {label ? `${label} ${explorer.name}` : explorer.name} ↗
    </a>
  );
}

/** Explorer links for a section's confirmed transactions (useTx with a `log` scope). They outlive TxStatus. */
export function TxLinks({ scope }: { scope: string }) {
  const { address } = useAccount();
  const entries = useTxLog(address, scope);
  if (entries.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {entries.map((e) => (
        <li key={e.hash} className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-caption text-carbon/70">{e.label}</span>
          <ExplorerLink hash={e.hash} />
        </li>
      ))}
    </ul>
  );
}
