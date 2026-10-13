"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { Stat } from "@/components/forms";
import { Badge, PageTitle } from "@/components/ui";
import { deploymentFor } from "@/hooks/useVeil";
import { defaultChain } from "@/lib/chains";
import { VeilPayrollAbi, IncomeCredentialAbi } from "@/lib/contracts/abis";
import { formatAmount, tokensFor } from "@/lib/tokens";

type Credential = {
  payee: Address;
  payer: Address;
  verifier: Address;
  token: Address;
  streamId: bigint;
  threshold: bigint;
  issuedAt: bigint;
  expiresAt: bigint;
  streamActiveSince: bigint;
  revoked: boolean;
  employeeVerified: boolean;
  ok: boolean;
};

/** Seconds since the epoch, ticking every second */
function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function formatCountdown(seconds: number) {
  if (seconds <= 0) return "now";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const formatTime = (t: bigint) => new Date(Number(t) * 1000).toLocaleString();

/**
 * A landlord's view of one income credential (12 A). It's all public onchain, so it reads with no wallet.
 */
export function CredentialView({ id }: { id: string }) {
  // Reads go to Veil's chain even before anyone logs in
  const chainId = defaultChain.id;
  const d = deploymentFor(chainId);
  const validId = /^\d+$/.test(id);
  const credId = validId ? BigInt(id) : BigInt(0);
  const now = useNow();

  const cred = useReadContract({
    chainId,
    address: d?.incomeCredential,
    abi: IncomeCredentialAbi,
    functionName: "get",
    args: [credId],
    query: { enabled: validId && !!d, refetchInterval: 10_000 },
  });
  const c = cred.data as Credential | undefined;
  const org = useReadContract({
    chainId,
    address: d?.payroll,
    abi: VeilPayrollAbi,
    functionName: "orgOf",
    args: c ? [c.payer] : undefined,
    query: { enabled: !!c && !!d },
  });

  if (!d) return <p className="text-carbon/70">Veil isn&apos;t deployed on this network.</p>;
  if (!validId) return <p className="text-carbon/70">That isn&apos;t a credential number.</p>;
  if (cred.isLoading) return <p className="text-carbon/55">Loading credential #{id}…</p>;
  if (!c || c.payee === "0x0000000000000000000000000000000000000000") {
    return <p className="text-carbon/70">Credential #{id} doesn&apos;t exist.</p>;
  }

  const token = tokensFor(chainId).find((t) => t.address.toLowerCase() === c.token.toLowerCase());
  const unit = token?.symbol ?? "tokens";
  // Computed in the browser, so the banner flips to Expired live with no reload
  const status: "valid" | "expired" | "revoked" = c.revoked ? "revoked" : now >= Number(c.expiresAt) ? "expired" : "valid";
  const orgName = (org.data as { name: string; exists: boolean } | undefined)?.name;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Badge ghost>Income credential #{id}</Badge>
        <PageTitle stickers={["check", "lock"]}>
          Earns at least {formatAmount(c.threshold)} {unit} a month?
        </PageTitle>
      </div>

      <StatusBanner status={status} secondsLeft={Number(c.expiresAt) - now} />

      <div>
        <Stat label="Paid by">{orgName ?? shortAddress(c.payer)}</Stat>
        <Stat label="Salary stream active since">{c.streamActiveSince > BigInt(0) ? formatTime(c.streamActiveSince) : "not active"}</Stat>
        <Stat label="Issued">{formatTime(c.issuedAt)}</Stat>
        <Stat label="Expires">{formatTime(c.expiresAt)}</Stat>
        <Stat label="Issued to">{shortAddress(c.verifier)}</Stat>
        <Stat label="Issuer">
          {c.employeeVerified ? (
            `✓ Verified employee of ${orgName ?? shortAddress(c.payer)}`
          ) : (
            <span className="text-carbon/70">Employment not verified by both sides</span>
          )}
        </Stat>
      </div>

      {status === "valid" && <Answer ok={c.ok} />}
    </div>
  );
}

function StatusBanner({ status, secondsLeft }: { status: "valid" | "expired" | "revoked"; secondsLeft: number }) {
  const styles = {
    valid: "bg-carbon text-paper-white",
    expired: "border border-carbon text-carbon",
    revoked: "border border-carbon text-carbon",
  };
  const text = {
    valid: `Valid · expires in ${formatCountdown(secondsLeft)}`,
    expired: "Expired. Ask for a new one if you still need it.",
    revoked: "Revoked by the person who issued it.",
  };
  return (
    <div className={`rounded-cards px-6 py-5 text-subheading ${styles[status]}`} role="status" aria-live="polite">
      {text[status]}
    </div>
  );
}

/** The answer, checked onchain against the salary stream when the credential was issued */
function Answer({ ok }: { ok: boolean }) {
  return (
    <div className="flex items-center gap-6 rounded-cards bg-paper-white p-8">
      <span className="text-[80px] leading-none">{ok ? "✅" : "❌"}</span>
      <p className="text-heading-sm">{ok ? "Yes, it meets the threshold." : "No, it's below the threshold."}</p>
    </div>
  );
}
