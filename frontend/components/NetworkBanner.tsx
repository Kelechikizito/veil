"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSwitchChain } from "wagmi";
import { isSupportedChainId, supportedChains } from "@/lib/chains";

/**
 * Wrong-network prompt. Shows only when a logged-in user's wallet is on a chain Veil doesn't run on.
 * An injected wallet (MetaMask) can connect to wagmi without a Privy login, so check both.
 */
export function NetworkBanner() {
  const { authenticated } = usePrivy();
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!authenticated || !isConnected || isSupportedChainId(chainId)) return null;

  return (
    <div className="bg-carbon py-3 text-caption text-paper-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-6">
        <span>Your wallet is on a network Veil doesn&apos;t support. Switch to continue.</span>
        <div className="flex gap-2">
          {supportedChains.map((c) => (
            <button
              key={c.id}
              data-cuelume-tap=""
              disabled={isPending}
              onClick={() => switchChain({ chainId: c.id })}
              className="rounded-pills border border-paper-white px-4 py-1 hover:bg-paper-white/10 disabled:opacity-50"
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
