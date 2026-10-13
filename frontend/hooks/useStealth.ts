"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AnnouncementRow } from "@/app/api/announcements/route";
import { useCallback } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useReadContract, useSignMessage } from "wagmi";
import type { StreamRow } from "@/components/employer/streams";
import { useGasSponsored } from "@/hooks/useTx";
import { useVeil } from "@/hooks/useVeil";
import { StealthRegistryAbi, VeilPayrollAbi } from "@/lib/contracts/abis";
import { keysFromSignature, STEALTH_KEYS_MESSAGE, STEALTH_SCHEME, stealthKeyFor, type StealthKeys } from "@/lib/stealth";

/** A stealth stream the connected worker owns, with the one-time address's private key */
export type StealthStreamRow = StreamRow & { stealthKey: Hex };

const BATCH = 200;

/**
 * The worker's stealth keys, from one signature of a fixed message. Kept in memory only, never stored.
 * Embedded wallets sign silently, so `auto` unlocks on arrival. Other wallets wait for `unlock()`.
 */
export function useStealthKeys(auto = true) {
  const { account } = useVeil();
  const embedded = useGasSponsored();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const queryKey = ["stealth-keys", account];
  const queryFn = useCallback(
    async () => keysFromSignature(await signMessageAsync({ message: STEALTH_KEYS_MESSAGE, account })),
    [signMessageAsync, account],
  );

  const q = useQuery({
    queryKey,
    queryFn,
    enabled: !!account && auto && embedded,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  const unlock = useCallback(
    () => queryClient.fetchQuery({ queryKey, queryFn, staleTime: Infinity }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, queryFn, account],
  );

  return { keys: q.data, unlock, unlocking: q.isFetching, error: q.error };
}

/** A wallet's registered meta-address, or undefined if it has none (or while loading) */
export function useMetaAddressOf(wallet: Address | undefined) {
  const { d } = useVeil();
  const { data, isLoading, refetch } = useReadContract({
    address: d?.stealthRegistry,
    abi: StealthRegistryAbi,
    functionName: "stealthMetaAddressOf",
    args: wallet ? [wallet, STEALTH_SCHEME] : undefined,
    query: { enabled: !!wallet && !!d?.stealthRegistry },
  });
  const meta = data && data !== "0x" ? (data as Hex) : undefined;
  return { meta, isLoading, refetch };
}

/** Whether the connected worker's registered meta-address matches the keys their wallet derives */
export function useStealthSetup(keys: StealthKeys | undefined) {
  const { account } = useVeil();
  const { meta, isLoading, refetch } = useMetaAddressOf(account);
  return {
    registered: !!meta,
    upToDate: !!meta && !!keys && meta.toLowerCase() === keys.metaAddress.toLowerCase(),
    isLoading,
    refetch,
  };
}

/**
 * The stealth streams that belong to the connected worker. Matches every announcement against the worker's
 * viewing key (the view tag rules out about 255 in 256 strangers' streams), then reads only the matches.
 * Announcements come from Envio HyperSync through /api/announcements; without it, this reads every stream's
 * announcement over RPC instead.
 */
export function useStealthStreams(keys: StealthKeys | undefined, pollMs = 15_000) {
  const { d } = useVeil();
  const publicClient = usePublicClient();
  return useQuery({
    queryKey: ["stealth-streams", d?.payroll, keys?.metaAddress],
    enabled: !!keys && !!d && !!publicClient,
    refetchInterval: pollMs,
    queryFn: async (): Promise<StealthStreamRow[]> => {
      const payroll = d!.payroll;
      const indexed = await fetchAnnouncements();
      if (indexed) {
        const matches = indexed.flatMap((a) => {
          const stealthKey = stealthKeyFor(keys!, a.ephemeralPubKey, a.viewTag, a.stealthAddress);
          return stealthKey ? [{ id: BigInt(a.id), stealthKey }] : [];
        });
        if (matches.length === 0) return [];
        const streams = await publicClient!.multicall({
          contracts: matches.map((m) => ({ address: payroll, abi: VeilPayrollAbi, functionName: "getStream" as const, args: [m.id] as const })),
          allowFailure: false,
        });
        return matches.map((m, i) => ({ id: m.id, ...(streams[i] as Omit<StreamRow, "id">), stealthKey: m.stealthKey })).reverse();
      }
      const count = (await publicClient!.readContract({ address: payroll, abi: VeilPayrollAbi, functionName: "streamCount" })) as bigint;
      const mine: StealthStreamRow[] = [];
      for (let start = 1; start <= Number(count); start += BATCH) {
        const ids = Array.from({ length: Math.min(BATCH, Number(count) - start + 1) }, (_, i) => BigInt(start + i));
        const announcements = await publicClient!.multicall({
          contracts: ids.map((id) => ({ address: payroll, abi: VeilPayrollAbi, functionName: "announcementOf" as const, args: [id] as const })),
          allowFailure: false,
        });
        const candidates = ids.filter((_, i) => (announcements[i] as { ephemeralPubKey: Hex }).ephemeralPubKey !== "0x");
        if (candidates.length === 0) continue;
        const streams = await publicClient!.multicall({
          contracts: candidates.map((id) => ({ address: payroll, abi: VeilPayrollAbi, functionName: "getStream" as const, args: [id] as const })),
          allowFailure: false,
        });
        candidates.forEach((id, i) => {
          const a = announcements[ids.indexOf(id)] as { ephemeralPubKey: Hex; viewTag: Hex };
          const s = streams[i] as Omit<StreamRow, "id">;
          const stealthKey = stealthKeyFor(keys!, a.ephemeralPubKey, a.viewTag, s.payee);
          if (stealthKey) mine.push({ id, ...s, stealthKey });
        });
      }
      return mine.reverse();
    },
  });
}

/** Announcements indexed by Envio HyperSync, or undefined when the index isn't available */
async function fetchAnnouncements(): Promise<AnnouncementRow[] | undefined> {
  try {
    const res = await fetch("/api/announcements", { cache: "no-store" });
    if (!res.ok) return undefined;
    return ((await res.json()) as { announcements: AnnouncementRow[] }).announcements;
  } catch {
    return undefined;
  }
}
