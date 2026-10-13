"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Hex, TransactionReceipt } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import type { TxStage } from "@/components/TxStatus";
import { shortError } from "@/hooks/useTx";
import type { RelayRequest, RelayResponse } from "@/lib/relay";
import { addTx } from "@/lib/txLog";

type RelayBody = RelayRequest extends infer R ? (R extends RelayRequest ? Omit<R, "chainId"> : never) : never;

/**
 * Sends a stealth payee's signed call through /api/relay, which pays the gas. Same stages as useTx, so
 * TxStatus shows it the same way: signing (in the browser, instant) → confirming → done | error.
 */
export function useRelay(log?: string) {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<TxStage>("idle");
  const [error, setError] = useState<string>();
  const [hash, setHash] = useState<Hex>();

  const run = useCallback(
    async (build: () => Promise<RelayBody>, opts: { label?: string } = {}): Promise<TransactionReceipt | undefined> => {
      setError(undefined);
      setHash(undefined);
      try {
        if (!publicClient || !chainId) throw new Error("Connect a wallet first");
        setStage("signing");
        const body = await build();
        const res = await fetch("/api/relay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, chainId }),
        });
        const out = (await res.json()) as RelayResponse;
        if ("error" in out) throw new Error(out.error);

        setHash(out.hash);
        setStage("confirming");
        const receipt = await publicClient.waitForTransactionReceipt({ hash: out.hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        if (log && address) addTx(address, log, { label: opts.label ?? "Transaction", hash: out.hash });

        await queryClient.invalidateQueries();
        setStage("done");
        return receipt;
      } catch (e) {
        console.error("[veil] relayed transaction failed", e);
        setError(shortError(e));
        setStage("error");
        return undefined;
      }
    },
    [address, chainId, publicClient, queryClient, log],
  );

  return { stage, error, hash, run, busy: stage !== "idle" && stage !== "done" && stage !== "error" };
}
