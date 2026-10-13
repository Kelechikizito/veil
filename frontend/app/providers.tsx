"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { WagmiProvider, createConfig, useSetActiveWallet } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { http, useAccount } from "wagmi";
import { defaultChain, rpcUrls, supportedChains, type SupportedChain } from "@/lib/chains";
import { privyChains } from "@/lib/privyChains";
import { isEmbeddedWallet } from "@/lib/wallets";
import { SoundBinder } from "@/components/Toggles";

/*
 * Order matters: Privy → React Query → wagmi.
 * `createConfig` and `WagmiProvider` come from @privy-io/wagmi, not wagmi, so the
 * wallet Privy logs in with becomes wagmi's active account.
 */

const wagmiConfig = createConfig({
  chains: supportedChains,
  transports: Object.fromEntries(supportedChains.map((c) => [c.id, http(rpcUrls[c.id])])) as Record<
    SupportedChain["id"],
    ReturnType<typeof http>
  >,
  ssr: true,
});

/**
 * Keeps wagmi's active wallet on the one the user logged in with.
 * Google or email login: the embedded wallet, never MetaMask. Right after a social login the embedded
 * wallet is still being created, so wait for it rather than fall back to an injected wallet (that
 * fallback made MetaMask pop up). Also switch away when wagmi reconnected MetaMask from an earlier visit.
 */
function ActiveWalletSync() {
  const { authenticated, user } = usePrivy();
  const { wallets, ready } = useWallets();
  const { address } = useAccount();
  const { setActiveWallet } = useSetActiveWallet();

  useEffect(() => {
    if (!authenticated || !ready) return;
    const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
    // user.wallet is the account's own wallet: embedded for a social login, MetaMask for a wallet login
    const own = user?.wallet?.address;
    // Any embedded wallet is fine (the org switcher moves between them), and so is the login wallet
    const active = wallets.find((w) => same(w.address, address));
    if (active && (isEmbeddedWallet(active) || same(active.address, own))) return;
    const target = wallets.find((w) => same(w.address, own)) ?? wallets.find(isEmbeddedWallet);
    if (!target) return;
    // An injected wallet that's locked or hasn't approved this site rejects here; AppGate then offers a retry
    setActiveWallet(target).catch((e) => console.warn("[veil] couldn't activate wallet", target.address, e));
  }, [authenticated, ready, user?.wallet?.address, address, wallets, setActiveWallet]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return <MissingPrivyAppId />;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // The e2e tests log the worker in with Privy's test phone number, so they turn SMS on
        loginMethods: process.env.NEXT_PUBLIC_E2E === "true" ? ["email", "sms", "google", "wallet"] : ["email", "google", "wallet"],
        defaultChain: privyChains.find((c) => c.id === defaultChain.id) ?? defaultChain,
        supportedChains: privyChains,
        // No confirm pop-ups for embedded wallets: gas is sponsored, and each action already shows its own progress
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
        appearance: { theme: "light", accentColor: "#000000" },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <ActiveWalletSync />
          <SoundBinder />
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

/** Shown in development when the Privy App ID isn't configured */
function MissingPrivyAppId() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="display-type text-display-70">Privy isn&apos;t configured</h1>
      <p className="text-carbon/70">
        Add <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to <code>frontend/.env.local</code> and restart <code>npm run dev</code>.
        The App ID is public. Never prefix the App Secret with <code>NEXT_PUBLIC_</code>.
      </p>
    </div>
  );
}
