"use client";

import { useReadContract } from "wagmi";
import { Badge, ButtonLink, PageTitle } from "@/components/ui";
import { useVeil } from "@/hooks/useVeil";
import { DemoTokenAbi } from "@/lib/contracts/abis";
import { formatAmount } from "@/lib/tokens";
import { CredentialsSection } from "./CredentialsSection";
import { PrivatePaySetup, useMyStreams } from "./PrivatePay";
import { StreamCard } from "./StreamCard";
import { WorkerBriefs } from "@/components/agents/RoleBriefs";

/** The worker app (11): live pay first, then income proofs */
export function WorkerApp() {
  const { rows, isLoading } = useMyStreams(15_000);
  const { account, tokens } = useVeil();
  const usdc = tokens[0];
  const wallet = useReadContract({
    address: usdc?.address,
    abi: DemoTokenAbi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account && !!usdc, refetchInterval: 15_000 },
  });

  if (isLoading) return <p className="py-10 text-carbon/55">Loading your pay…</p>;

  if (rows.length === 0) {
    return (
      <div className="flex max-w-xl flex-col gap-4 py-10">
        <h2 className="text-heading-sm">No salary stream yet</h2>
        <p className="text-carbon/70">
          Send your wallet address to your employer. Your pay shows up here as soon as they start it.
        </p>
        <div>
          <ButtonLink href="/onboarding/employee">Set up your account</ButtonLink>
        </div>
        <PrivatePaySetup />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Badge ghost>Your pay</Badge>
          <PageTitle stickers={["clock", "coin"]}>Paid by the second.</PageTitle>
        </div>
        {usdc && wallet.data !== undefined && (
          <span className="text-caption text-carbon/70">
            In your wallet: <span className="tabular-nums text-carbon">{formatAmount(wallet.data, usdc.decimals)} {usdc.symbol}</span>
          </span>
        )}
      </header>

      {rows.map((s) => (
        <StreamCard key={String(s.id)} stream={s} />
      ))}

      <section className="flex flex-col gap-3 rounded-cards-elevated border border-carbon bg-paper-white p-6">
        <span className="text-subheading">Private pay</span>
        <PrivatePaySetup />
      </section>

      <CredentialsSection streams={rows} />
      <WorkerBriefs />
    </div>
  );
}
