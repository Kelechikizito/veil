"use client";

import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { WagmiProvider, createConfig, useSetActiveWallet } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { http, useAccount } from "wagmi";
import { defaultChain, rpcUrls, supportedChains, type SupportedChain } from "@/lib/chains";
import { privyChains } from "@/lib/privyChains";

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
 * Makes sure wagmi has an active wallet once Privy is logged in.
 * With an injected wallet (MetaMask) present next to the embedded one, @privy-io/wagmi can leave
 * wagmi with no account. Prefer the embedded wallet: it's the one Veil created for this user.
 */
function ActiveWalletSync() {
  const { authenticated } = usePrivy();
  const { wallets, ready } = useWallets();
  const { address } = useAccount();
  const { setActiveWallet } = useSetActiveWallet();

  useEffect(() => {
    if (!authenticated || !ready || address || wallets.length === 0) return;
    const preferred = wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];
    // An injected wallet that's locked or hasn't approved this site rejects here; AppGate then offers a retry
    setActiveWallet(preferred).catch((e) => console.warn("[veil] couldn't activate wallet", preferred.address, e));
  }, [authenticated, ready, address, wallets, setActiveWallet]);

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
        loginMethods: ["email", "google", "wallet"],
        defaultChain: privyChains.find((c) => c.id === defaultChain.id) ?? defaultChain,
        supportedChains: privyChains,
        // No confirm pop-ups for embedded wallets: gas is sponsored, and each action already shows its own progress
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
        appearance: { theme: "light", accentColor: "#17150e" },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <ActiveWalletSync />
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
      <h1 className="text-heading">Privy isn&apos;t configured</h1>
      <p className="text-soft-charcoal">
        Add <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to <code>frontend/.env.local</code> and restart <code>npm run dev</code>.
        The App ID is public. Never prefix the App Secret with <code>NEXT_PUBLIC_</code>.
      </p>
    </div>
  );
}
