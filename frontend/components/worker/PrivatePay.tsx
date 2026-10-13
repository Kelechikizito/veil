"use client";

import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useStealthKeys, useStealthSetup, useStealthStreams } from "@/hooks/useStealth";
import { useTx } from "@/hooks/useTx";
import { useVeil } from "@/hooks/useVeil";
import { StealthRegistryAbi } from "@/lib/contracts/abis";
import { STEALTH_SCHEME } from "@/lib/stealth";
import { useStreamsOfPayee } from "./hooks";

/**
 * Every stream that pays the connected worker: plain ones (paid to their wallet) and private ones
 * (paid to one-time addresses only they can find). Newest first.
 */
export function useMyStreams(pollMs?: number) {
  const plain = useStreamsOfPayee(pollMs);
  const { keys } = useStealthKeys();
  const stealth = useStealthStreams(keys, pollMs);
  const rows = [...(stealth.data ?? []), ...plain.rows].sort((a, b) => (a.id > b.id ? -1 : 1));
  return {
    rows,
    count: plain.count + (stealth.data?.length ?? 0),
    isLoading: plain.isLoading || (!!keys && stealth.isLoading),
  };
}

/**
 * Turns on private pay: publishes the worker's stealth meta-address, so employers pay a fresh one-time address
 * each time. One signature (silent for Veil wallets) and one transaction (gas sponsored).
 */
export function PrivatePaySetup() {
  const { d } = useVeil();
  const { keys, unlock, unlocking } = useStealthKeys();
  const setup = useStealthSetup(keys);
  const tx = useTx();

  if (!d?.stealthRegistry) return null;
  if (setup.upToDate) {
    return <p>✓ Private pay is on. Employers pay you at one-time addresses that only you can link to you.</p>;
  }
  // Already on, but this wallet hasn't signed yet this session (wallets other than Veil's ask first)
  if (setup.registered && !keys) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-carbon/70">Private pay is on. Sign once to find the salaries paid to your one-time addresses.</p>
        <div>
          <Button onClick={() => void unlock().catch(() => undefined)} disabled={unlocking}>
            {unlocking ? "Waiting for signature…" : "Show private pay"}
          </Button>
        </div>
      </div>
    );
  }

  const turnOn = async () => {
    const k = keys ?? (await unlock().catch(() => undefined));
    if (!k) return;
    const receipt = await tx.run(
      () => ({ address: d.stealthRegistry, abi: StealthRegistryAbi, functionName: "registerKeys", args: [STEALTH_SCHEME, k.metaAddress] }),
      { label: "Turned on private pay" },
    );
    if (receipt) void setup.refetch();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => void turnOn()} disabled={tx.busy || unlocking || setup.isLoading}>
          {unlocking ? "Waiting for signature…" : setup.registered ? "Update private pay" : "Turn on private pay"}
        </Button>
      </div>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </div>
  );
}
