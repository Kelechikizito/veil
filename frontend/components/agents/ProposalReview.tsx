"use client";

import { useMemo } from "react";
import { decodeFunctionData, isAddress, isHex, type Abi, type Address, type Hex } from "viem";
import { Stat } from "@/components/forms";
import { TxStatus } from "@/components/TxStatus";
import { Badge, Button, ButtonLink } from "@/components/ui";
import { useTx } from "@/hooks/useTx";
import { useVeil, type Deployment } from "@/hooks/useVeil";
import {
  ApprovalPolicyAbi,
  AuditRegistryAbi,
  DemoTokenAbi,
  EmployeeRegistryAbi,
  IncomeCredentialAbi,
  JoinRequestsAbi,
  VeilPayrollAbi,
} from "@/lib/contracts/abis";
import { formatAmount } from "@/lib/tokens";

/*
 * /sign: an agent proposes a call, the person reviews and signs it (docs: /docs/api).
 * Only Veil's contracts, and only functions on the allowlist below. Withdrawals, signature-based calls,
 * passkey confirms and token transfers are never accepted: those stay in the app's own screens.
 */

type Args = readonly unknown[];
type Rule = { says: (a: Args, d: Deployment) => string; careful?: boolean };

const usdc = (v: unknown) => `${formatAmount(v as bigint, 6)} USDC`;
const short = (v: unknown) => {
  const s = String(v);
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};
const ids = (v: unknown) => (v as bigint[]).map((x) => `#${x}`).join(", ");

/** What each allowed function does, in plain words */
const ALLOWED: Record<string, Record<string, Rule>> = {
  payroll: {
    fundVault: { says: (a) => `Move ${usdc(a[1])} from your wallet into your payroll vault.` },
    runPayroll: { says: (a) => `Run payroll with a budget of ${usdc(a[1])}, shared in order across salaries ${ids(a[2])}.` },
    activateApproved: { says: (a) => `Start salary #${a[0]}, now that its approvals are in.` },
    cancelStream: { says: (a) => `Stop salary #${a[0]}. What it already earned stays the worker's.`, careful: true },
    defundVault: { says: (a) => `Move ${usdc(a[1])} out of your payroll vault, back to your wallet.`, careful: true },
    createOrg: { says: (a) => `Create your organisation, named “${a[0]}”.` },
  },
  approvalPolicy: {
    approve: { says: (a) => `Approve salary #${a[1]} from employer ${short(a[0])}.` },
    setPolicy: { says: (a) => `Set your approvers to ${(a[0] as Address[]).length} people, needing ${a[1]} of them.`, careful: true },
    setThreshold: { says: (a) => `Salaries above ${usdc(a[1])} a month will need approval.`, careful: true },
  },
  auditRegistry: {
    addAuditor: { says: (a) => `Let ${short(a[0])} audit your payroll books.`, careful: true },
    removeAuditor: { says: (a) => `Stop ${short(a[0])} auditing your payroll.` },
  },
  employeeRegistry: {
    vouch: { says: (a) => `Vouch that ${short(a[0])} works for you.` },
    revokeVouch: { says: (a) => `Withdraw your vouch for ${short(a[0])}.`, careful: true },
  },
  joinRequests: {
    dismiss: { says: (a) => `Dismiss ${short(a[0])}'s request to join.` },
  },
  incomeCredential: {
    revoke: { says: (a) => `Revoke income proof #${a[0]}. The verifier will see it as revoked.` },
  },
  usdc: {
    // Only an allowance for the payroll contract, the step before fundVault
    approve: { says: (a) => `Let Veil's payroll contract take USDC from your wallet when you fund the vault (up to ${a[1] === BigInt(2) ** BigInt(256) - BigInt(1) ? "any amount" : usdc(a[1])}).` },
    mint: { says: (a) => `Mint ${usdc(a[1])} of testnet USDC to ${short(a[0])}. Testnet only.` },
  },
};

const ABIS: Record<string, Abi> = {
  payroll: VeilPayrollAbi as Abi,
  approvalPolicy: ApprovalPolicyAbi as Abi,
  auditRegistry: AuditRegistryAbi as Abi,
  employeeRegistry: EmployeeRegistryAbi as Abi,
  joinRequests: JoinRequestsAbi as Abi,
  incomeCredential: IncomeCredentialAbi as Abi,
  usdc: DemoTokenAbi as Abi,
};

const NAMES: Record<string, string> = {
  payroll: "VeilPayroll",
  approvalPolicy: "ApprovalPolicy",
  auditRegistry: "AuditRegistry",
  employeeRegistry: "EmployeeRegistry",
  joinRequests: "JoinRequests",
  incomeCredential: "IncomeCredential",
  usdc: "USDC",
};

type Proposal =
  | { ok: true; key: string; to: Address; functionName: string; args: Args; rule: Rule }
  | { ok: false; reason: string };

function parse(to: string | undefined, data: string | undefined, d: Deployment | undefined): Proposal {
  if (!d) return { ok: false, reason: "Veil isn't deployed on this network yet." };
  if (!to || !isAddress(to)) return { ok: false, reason: "The link has no contract address." };
  if (!data || !isHex(data)) return { ok: false, reason: "The link has no call data." };
  const key = Object.keys(ABIS).find((k) => String(d[k as keyof Deployment]).toLowerCase() === to.toLowerCase());
  if (!key) return { ok: false, reason: "That address isn't one of Veil's contracts, so it can't be signed here." };
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: ABIS[key], data: data as Hex });
  } catch {
    return { ok: false, reason: "The call data doesn't match the contract. The agent may have built it wrong." };
  }
  const rule = ALLOWED[key][decoded.functionName];
  if (!rule) {
    return { ok: false, reason: `${NAMES[key]}.${decoded.functionName} can't be proposed by an agent. Use Veil's own screens for it.` };
  }
  const args = decoded.args ?? [];
  if (key === "usdc" && decoded.functionName === "approve" && String(args[0]).toLowerCase() !== d.payroll.toLowerCase()) {
    return { ok: false, reason: "That USDC allowance isn't for Veil's payroll contract, so it can't be signed here." };
  }
  return { ok: true, key, to: to as Address, functionName: decoded.functionName, args, rule };
}

export function ProposalReview({ to, data, note }: { to?: string; data?: string; note?: string }) {
  const { d, account } = useVeil();
  const tx = useTx("agent");
  const p = useMemo(() => parse(to, data, d), [to, data, d]);

  if (!p.ok) {
    return (
      <div className="flex flex-col gap-4 rounded-cards-elevated border border-carbon bg-paper-white p-6 md:p-8">
        <Badge ghost>Can&apos;t sign this</Badge>
        <p className="text-subheading">{p.reason}</p>
        <div>
          <ButtonLink href="/docs/api" variant="outline">
            How proposals work
          </ButtonLink>
        </div>
      </div>
    );
  }

  const done = tx.stage === "done";
  return (
    <div className="flex flex-col gap-6 rounded-cards-elevated border border-carbon bg-paper-white p-6 md:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge ghost>Proposed by an agent</Badge>
        {p.rule.careful && <Badge>Check carefully</Badge>}
      </div>
      <p className="text-heading-sm font-bold">{p.rule.says(p.args, d!)}</p>

      {note && (
        <div className="flex flex-col gap-1 rounded-cards border border-carbon bg-lavender p-5">
          <span className="label-type text-caption uppercase">The agent&apos;s note (not checked)</span>
          <p className="break-words whitespace-pre-line">{note.slice(0, 280)}</p>
        </div>
      )}

      <div>
        <Stat label="Contract">
          {NAMES[p.key]} <span className="font-mono text-caption text-carbon/55">{short(p.to)}</span>
        </Stat>
        <Stat label="Function">
          <span className="font-mono">{p.functionName}</span>
        </Stat>
        {p.args.map((a, i) => (
          <Stat key={i} label={`Argument ${i + 1}`}>
            <span className="font-mono text-caption break-all">{Array.isArray(a) ? `[${a.join(", ")}]` : String(a)}</span>
          </Stat>
        ))}
        <Stat label="You sign as">
          <span className="font-mono text-caption">{account ? short(account) : "—"}</span>
        </Stat>
      </div>

      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />

      {!done && (
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={tx.busy}
            onClick={() =>
              void tx.run(() => ({ address: p.to, abi: ABIS[p.key], functionName: p.functionName, args: p.args }) as never, {
                label: `Agent proposal: ${p.functionName}`,
              })
            }
          >
            Sign and send
          </Button>
          <ButtonLink href="/" variant="outline">
            Don&apos;t sign
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
