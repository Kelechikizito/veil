import { defineChain } from "viem";
import { monadTestnet as viemMonadTestnet } from "viem/chains";

/*
 * Veil runs on Monad testnet.
 * The RPC URL is optional. Without it, viem uses the public RPC.
 * If you set an Alchemy URL here, it ships to the browser: restrict its allowed
 * origins in the Alchemy dashboard.
 */

/** viem's Monad testnet, with MonadVision as the explorer */
export const monadTestnet = defineChain({
  ...viemMonadTestnet,
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
});

export const supportedChains = [monadTestnet] as const;

export type SupportedChain = (typeof supportedChains)[number];

export const defaultChain = monadTestnet;

export const rpcUrls: Record<SupportedChain["id"], string | undefined> = {
  [monadTestnet.id]: process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC || undefined,
};

/** Whether a chain id is one Veil runs on */
export function isSupportedChainId(id: number | undefined): id is SupportedChain["id"] {
  return supportedChains.some((c) => c.id === id);
}

/** A supported chain by id, or the default chain */
export function chainFor(id: number | undefined): SupportedChain {
  return supportedChains.find((c) => c.id === id) ?? defaultChain;
}
