"use client";

import type { Address, Hex, PublicClient } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { useVeil } from "@/hooks/useVeil";
import { VeilPayrollAbi } from "@/lib/contracts/abis";

/** Mirrors IVeilPayroll.Status */
export const StreamStatus = { None: 0, Pending: 1, Active: 2, Cancelled: 3 } as const;

export const statusLabel: Record<number, string> = {
  0: "—",
  1: "Needs approval",
  2: "Active",
  3: "Cancelled",
};

export type StreamRow = {
  id: bigint;
  payer: Address;
  payee: Address;
  token: Address;
  monthly: bigint;
  withdrawn: bigint;
  /** Set aside by the latest payroll run; streams from allocStart to allocEnd */
  allocated: bigint;
  /** Set aside in earlier periods (or before a cancel), fully earned */
  banked: bigint;
  startTime: bigint;
  endTime: bigint;
  status: number;
  allocStart: bigint;
  /** End of the period `allocated` is for; 0 if none */
  allocEnd: bigint;
  /** Set on the worker's own stealth streams: the one-time address's private key, kept in memory */
  stealthKey?: Hex;
};

/** End of the pay period containing `nowSec`. Mirrors VeilPayroll._periodEnd: fixed windows from time 0. */
export function periodEndOf(nowSec: bigint, period: number): bigint {
  const p = BigInt(period);
  return (nowSec / p + BigInt(1)) * p;
}

/** Whether payroll has already set money aside for this stream in the current period */
export function fundedThisPeriod(s: StreamRow, nowSec: bigint, period: number): boolean {
  return s.allocEnd === periodEndOf(nowSec, period);
}

const SCAN_BATCH = 50;

/**
 * Every stream ever created, oldest first. For views with no onchain index to start from
 * (approvers, auditors). Event logs can't be used: RPCs cap eth_getLogs at 10 (Alchemy free) or
 * 200 (public) blocks. Stream ids run 1, 2, 3…, so this reads them in batches until one comes back
 * empty. Fine at demo scale; checkpoint 13 swaps in a subgraph.
 */
export async function scanAllStreams(publicClient: PublicClient, payroll: Address): Promise<StreamRow[]> {
  const all: StreamRow[] = [];
  for (let start = 1; ; start += SCAN_BATCH) {
    const ids = Array.from({ length: SCAN_BATCH }, (_, i) => BigInt(start + i));
    const batch = await publicClient.multicall({
      contracts: ids.map((id) => ({ address: payroll, abi: VeilPayrollAbi, functionName: "getStream" as const, args: [id] as const })),
      allowFailure: false,
    });
    const rows = batch.map((s, i) => ({ id: ids[i], ...(s as Omit<StreamRow, "id">) }));
    const end = rows.findIndex((s) => s.status === StreamStatus.None);
    // An empty stream means we're past the last id
    if (end !== -1) return [...all, ...rows.slice(0, end)];
    all.push(...rows);
  }
}

/**
 * The connected employer's streams, newest first.
 * Reads `streamsOfPayer` then each stream. Fine at demo scale; checkpoint 13 swaps in a subgraph.
 */
export function useStreamsOfPayer() {
  const { account, d } = useVeil();
  const ids = useReadContract({
    address: d?.payroll,
    abi: VeilPayrollAbi,
    functionName: "streamsOfPayer",
    args: account ? [account] : undefined,
    query: { enabled: !!account && !!d },
  });
  const list = [...(ids.data ?? [])].reverse();
  const streams = useReadContracts({
    contracts: list.map((id) => ({
      address: d?.payroll,
      abi: VeilPayrollAbi,
      functionName: "getStream" as const,
      args: [id] as const,
    })),
    query: { enabled: list.length > 0 },
  });
  const rows: StreamRow[] = list.flatMap((id, i) => {
    const r = streams.data?.[i];
    return r?.status === "success" ? [{ id, ...(r.result as Omit<StreamRow, "id">) }] : [];
  });
  return { rows, isLoading: ids.isLoading || streams.isLoading };
}
