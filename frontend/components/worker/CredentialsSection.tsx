"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { decodeEventLog, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { usePublicClient, useReadContracts } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { StreamStatus, type StreamRow } from "@/components/employer/streams";
import { Field, Input, Panel, PillPicker } from "@/components/forms";
import { TxStatus } from "@/components/TxStatus";
import { Badge, Button } from "@/components/ui";
import { useVeil } from "@/hooks/useVeil";
import { useRelay } from "@/hooks/useRelay";
import { useTx } from "@/hooks/useTx";
import { IncomeCredentialAbi } from "@/lib/contracts/abis";
import { shortLink } from "@/lib/format";
import { credentialDomain, ISSUE_TYPES, RELAY_DEADLINE_SECONDS, REVOKE_TYPES } from "@/lib/relay";
import { formatAmount, parseAmount } from "@/lib/tokens";
import { useChainClockOffset } from "./hooks";

const EXPIRIES = [
  { value: "300", label: "5 min (demo)" },
  { value: "86400", label: "1 day" },
  { value: "604800", label: "7 days" },
  { value: "2592000", label: "30 days" },
] as const;

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

/** §4 Income credentials: prove "I earn at least X a month" to one verifier, for a limited time */
export function CredentialsSection({ streams }: { streams: StreamRow[] }) {
  return (
    <Panel
      title="Income proofs"
      help="Show a landlord or lender that you earn at least an amount. The proof names them, expires, and you can revoke it."
    >
      <IssueForm streams={streams.filter((s) => s.status === StreamStatus.Active)} />
      <MyCredentials streams={streams} />
    </Panel>
  );
}

function IssueForm({ streams }: { streams: StreamRow[] }) {
  const { d, tokens, chainId } = useVeil();
  const publicClient = usePublicClient();
  const direct = useTx();
  const relay = useRelay();
  const [streamId, setStreamId] = useState(streams[0] ? String(streams[0].id) : "");
  const [verifier, setVerifier] = useState("");
  const [threshold, setThreshold] = useState("");
  const [expiry, setExpiry] = useState<(typeof EXPIRIES)[number]["value"]>("86400");
  const [issuedId, setIssuedId] = useState<bigint>();
  const offset = useChainClockOffset();

  const stream = streams.find((s) => String(s.id) === streamId);
  const tx = stream?.stealthKey ? relay : direct;
  const symbolOf = (token: Address) => tokens.find((t) => t.address.toLowerCase() === token.toLowerCase())?.symbol ?? "";
  let parsed: bigint | undefined;
  try {
    parsed = threshold ? parseAmount(threshold) : undefined;
  } catch {
    parsed = undefined;
  }
  const valid = !!stream && isAddress(verifier.trim()) && parsed !== undefined;

  if (streams.length === 0) {
    return <p className="text-caption text-carbon/55">You need an active stream to issue an income proof.</p>;
  }

  const issue = async () => {
    setIssuedId(undefined);
    const expiresAt = BigInt(Math.floor(nowSeconds() + offset) + Number(expiry));
    const to = verifier.trim() as Address;
    const receipt = stream!.stealthKey
      ? await relay.run(async () => {
          // A stealth stream's payee is a one-time address with no gas: it signs, the relayer sends
          const signer = privateKeyToAccount(stream!.stealthKey!);
          const nonce = (await publicClient!.readContract({
            address: d!.incomeCredential,
            abi: IncomeCredentialAbi,
            functionName: "nonces",
            args: [signer.address],
          })) as bigint;
          const deadline = BigInt(Math.floor(nowSeconds() + offset) + RELAY_DEADLINE_SECONDS);
          const signature = await signer.signTypedData({
            domain: credentialDomain(chainId!, d!.incomeCredential),
            types: ISSUE_TYPES,
            primaryType: "Issue",
            message: { streamId: stream!.id, verifier: to, threshold: parsed!, expiresAt, nonce, deadline },
          });
          return {
            kind: "issue",
            streamId: String(stream!.id),
            verifier: to,
            threshold: String(parsed),
            expiresAt: String(expiresAt),
            deadline: String(deadline),
            signature,
          };
        })
      : await direct.run(() => ({
          address: d!.incomeCredential,
          abi: IncomeCredentialAbi,
          functionName: "issue",
          args: [stream!.id, to, parsed!, expiresAt],
        }));
    const issued = receipt?.logs
      .map((log) => {
        try {
          return decodeEventLog({ abi: IncomeCredentialAbi, data: log.data, topics: log.topics });
        } catch {
          return undefined;
        }
      })
      .find((e) => e?.eventName === "CredentialIssued");
    if (issued && "id" in issued.args) setIssuedId(issued.args.id as bigint);
  };

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void issue();
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Stream">
            <PillPicker
              options={streams.map((s) => ({ value: String(s.id), label: `#${s.id} · ${symbolOf(s.token)}` }))}
              value={streamId}
              onChange={setStreamId}
            />
          </Field>
          <Field label="Expires after">
            <PillPicker options={[...EXPIRIES]} value={expiry} onChange={setExpiry} />
          </Field>
          <Field label="Verifier's wallet" hint="The landlord or lender this proof is for.">
            <Input value={verifier} onChange={(e) => setVerifier(e.target.value)} placeholder="0x…" spellCheck={false} />
          </Field>
          <Field label={`They asked: at least how much per month? (${stream ? symbolOf(stream.token) : ""})`}>
            <Input inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="2500" />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={!valid || tx.busy}>
            Issue proof
          </Button>
        </div>
        {stream?.stealthKey && (
          <p className="text-caption text-carbon/70">
            This salary is paid privately. Issuing a proof shows the verifier which stream is yours, and how much it pays.
          </p>
        )}
        <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
      </form>
      {issuedId !== undefined && <ShareLink id={issuedId} />}
    </div>
  );
}

/** The link a verifier opens: /verify/<id>, with copy and a QR code */
function ShareLink({ id }: { id: bigint }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/verify/${id}`;
  return (
    <div className="flex flex-col gap-4 rounded-cards border border-carbon bg-voltage-violet p-6 text-paper-white md:flex-row md:items-center">
      <div className="rounded-wallet-icon border border-carbon bg-paper-white p-3">
        <QRCode value={link} size={120} fgColor="#000000" />
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <span className="label-type text-caption uppercase">Proof #{String(id)} issued. Send this link to the verifier.</span>
        <code className="font-mono text-caption" title={link}>
          {shortLink(link)}
        </code>
        <div>
          <Button
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
            className="!px-4 !py-2 text-caption"
          >
            {copied ? "✓ Copied" : "Copy link"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MyCredentials({ streams }: { streams: StreamRow[] }) {
  const { account, d, tokens, chainId } = useVeil();
  const publicClient = usePublicClient();
  const direct = useTx();
  const relay = useRelay();
  // Proofs can come from the main wallet or from any of the worker's one-time addresses
  const stealthKeyOf = new Map(streams.filter((s) => s.stealthKey).map((s) => [s.payee.toLowerCase(), s.stealthKey!]));
  const payees = [...(account ? [account] : []), ...streams.filter((s) => s.stealthKey).map((s) => s.payee)];
  const ids = useReadContracts({
    contracts: payees.map((p) => ({
      address: d?.incomeCredential,
      abi: IncomeCredentialAbi,
      functionName: "credentialsOf" as const,
      args: [p] as const,
    })),
    query: { enabled: payees.length > 0 && !!d },
  });
  const list = [...new Set((ids.data ?? []).flatMap((r) => (r.status === "success" ? (r.result as readonly bigint[]) : [])))].sort((a, b) =>
    a > b ? -1 : 1,
  );
  const tx = relay.busy || relay.stage === "error" || relay.stage === "done" ? relay : direct;
  const creds = useReadContracts({
    contracts: list.flatMap((id) => [
      { address: d?.incomeCredential, abi: IncomeCredentialAbi, functionName: "get" as const, args: [id] as const },
      { address: d?.incomeCredential, abi: IncomeCredentialAbi, functionName: "isValid" as const, args: [id] as const },
    ]),
    query: { enabled: list.length > 0 },
  });
  const now = useNow();
  const offset = useChainClockOffset();
  const symbolOf = (token: Address) => tokens.find((t) => t.address.toLowerCase() === token.toLowerCase())?.symbol ?? "";

  if (list.length === 0) return null;

  const revoke = (id: bigint, payee: Address) => {
    const stealthKey: Hex | undefined = stealthKeyOf.get(payee.toLowerCase());
    if (!stealthKey) {
      return direct.run(() => ({ address: d!.incomeCredential, abi: IncomeCredentialAbi, functionName: "revoke", args: [id] }));
    }
    return relay.run(async () => {
      const signer = privateKeyToAccount(stealthKey);
      const nonce = (await publicClient!.readContract({
        address: d!.incomeCredential,
        abi: IncomeCredentialAbi,
        functionName: "nonces",
        args: [signer.address],
      })) as bigint;
      const deadline = BigInt(Math.floor(nowSeconds() + offset) + RELAY_DEADLINE_SECONDS);
      const signature = await signer.signTypedData({
        domain: credentialDomain(chainId!, d!.incomeCredential),
        types: REVOKE_TYPES,
        primaryType: "Revoke",
        message: { id, nonce, deadline },
      });
      return { kind: "revoke", id: String(id), deadline: String(deadline), signature };
    });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-carbon pt-6">
      <h3 className="text-body">My proofs</h3>
      <ul className="flex flex-col">
        {list.map((id, i) => {
          const c = creds.data?.[i * 2]?.result as Credential | undefined;
          const valid = creds.data?.[i * 2 + 1]?.result as boolean | undefined;
          if (!c) return null;
          const left = Number(c.expiresAt) - (now + offset);
          const status = c.revoked ? "Revoked" : left <= 0 ? "Expired" : valid === false ? "Stream ended" : "Valid";
          return (
            <li key={String(id)} className="flex flex-wrap items-center justify-between gap-3 border-t border-carbon/10 py-3 text-caption">
              <span>
                #{String(id)} · ≥ {formatAmount(c.threshold)} {symbolOf(c.token)}/month · to {shortAddress(c.verifier)}
              </span>
              <span className="flex items-center gap-3">
                <Badge>{status}</Badge>
                {status === "Valid" && <span className="tabular-nums text-carbon/70">{countdown(left)}</span>}
                {status === "Valid" && (
                  <Button variant="outline" disabled={tx.busy} onClick={() => void revoke(id, c.payee)} className="!px-3 !py-1 text-caption">
                    Revoke
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </div>
  );
}

/** Wall-clock seconds, read when called (only from event handlers) */
function nowSeconds() {
  return Date.now() / 1000;
}

/** Wall-clock seconds, updated every second */
function useNow() {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** 2d 4h, 3h 12m, 4m 09s */
function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s left`;
}
