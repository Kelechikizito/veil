"use client";

import { useState } from "react";
import { formatUnits, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { usePublicClient } from "wagmi";
import { Field, Input } from "@/components/forms";
import { ConfirmEmployer, EmployeeBadge, useEmployment } from "@/components/Employment";
import { StreamStatus, statusLabel, type StreamRow } from "@/components/employer/streams";
import { TxStatus } from "@/components/TxStatus";
import { Badge, Button } from "@/components/ui";
import { useVeil } from "@/hooks/useVeil";
import { useRelay } from "@/hooks/useRelay";
import { useTx } from "@/hooks/useTx";
import { payrollDomain, RELAY_DEADLINE_SECONDS, WITHDRAW_TYPES } from "@/lib/relay";
import { VeilPayrollAbi } from "@/lib/contracts/abis";
import { formatAmount, parseAmount } from "@/lib/tokens";
import { useLiveBalance, useOrgName } from "./hooks";

/** One stream: who pays, the live balance (the demo moment), and withdraw */
export function StreamCard({ stream }: { stream: StreamRow }) {
  const { tokens, d } = useVeil();
  const org = useOrgName(stream.payer) ?? "your employer";
  const employment = useEmployment(stream.payee, stream.payer);
  const symbol = tokens.find((t) => t.address.toLowerCase() === stream.token.toLowerCase())?.symbol ?? "";
  const pay = useLiveBalance(stream);
  const active = stream.status === StreamStatus.Active;
  const funded = pay.thisPeriodTotal !== undefined;

  // The big number is only this period's pay: it counts up to what was set aside, then stops
  const [whole, fraction] = formatSixDp(pay.thisPeriod).split(".");
  const total = pay.thisPeriodTotal;
  const progress = total ? Number((pay.thisPeriod * BigInt(1000)) / total) / 10 : 0;
  const note = d && total !== undefined ? fundingNote(stream, d.period, stream.monthly, total, org, symbol) : undefined;

  return (
    <article className="flex flex-col gap-8 rounded-3xl bg-pure-white p-6 md:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {active && funded && <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-gloss-black" />}
          <span>Paid by {org}</span>
          {stream.stealthKey ? (
            <span
              className="rounded-lg border-[1.5px] border-gloss-black/20 px-2 py-0.5 text-caption text-soft-charcoal"
              title="Paid to a one-time address. Nobody else can tell this salary is yours."
            >
              private
            </span>
          ) : (
            <EmployeeBadge worker={stream.payee} employer={stream.payer} viewer="worker" />
          )}
        </div>
        <Badge>{statusLabel[stream.status]}</Badge>
      </header>

      <div className="flex flex-col gap-2">
        <span className="text-caption text-mid-grey">Your salary this period</span>
        <div className="flex flex-wrap items-baseline gap-3 font-classic text-[56px] leading-none tracking-[-0.03em] md:text-display">
          <span className="tabular-nums">
            {whole}
            <span className="text-mid-grey">.{fraction}</span>
          </span>
          {total !== undefined && (
            <span className="font-grotesk text-subheading">
              of {formatAmount(total)} {symbol}
            </span>
          )}
        </div>
        {funded && (
          <div
            role="progressbar"
            aria-label="This pay period"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 max-w-xl rounded-pill bg-gloss-black/10"
          >
            <div className="h-full rounded-pill bg-gloss-black" style={{ width: `${progress}%` }} />
          </div>
        )}
        {active && funded && (
          <span className="text-caption text-soft-charcoal">Updating live. 0 transactions.</span>
        )}
        {note && <span className="text-caption text-soft-charcoal">{note}</span>}
        {active && !funded && (
          <span className="text-caption text-soft-charcoal">
            Waiting for {org} to run payroll for this period. Your pay starts streaming as soon as they do.
          </span>
        )}
        {pay.unclaimedEarlier > BigInt(0) && (
          <span className="pt-2">
            <span className="text-caption text-mid-grey">Unclaimed from earlier periods </span>
            <span className="tabular-nums">
              {formatSixDp(pay.unclaimedEarlier)} {symbol}
            </span>
          </span>
        )}
        {stream.status === StreamStatus.Pending && (
          <span className="text-caption text-soft-charcoal">Waiting for your employer&apos;s approvers. Pay starts when they approve.</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 border-t-[1.5px] border-gloss-black pt-5 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-mid-grey">Monthly salary</dt>
          <dd>{`${formatAmount(stream.monthly)} ${symbol}`}</dd>
          {d && demoMonth(d.period) && <dd className="text-caption text-soft-charcoal">{demoMonth(d.period)}</dd>}
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-mid-grey">Withdrawn so far</dt>
          <dd>{`${formatAmount(stream.withdrawn)} ${symbol}`}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-mid-grey">Started</dt>
          <dd>{stream.startTime > BigInt(0) ? new Date(Number(stream.startTime) * 1000).toLocaleString() : "—"}</dd>
        </div>
      </dl>

      {(stream.status === StreamStatus.Active || stream.status === StreamStatus.Cancelled) && (
        <WithdrawForm stream={stream} symbol={symbol} available={pay.available} />
      )}

      {!stream.stealthKey && stream.status !== StreamStatus.Cancelled && !employment.loading && employment.available && !employment.confirmed && (
        <div className="flex flex-col gap-3 rounded-2xl bg-gloss-white p-6">
          <span className="text-subheading">Confirm you work for {org}</span>
          <span className="text-caption text-soft-charcoal">
            One tap with Face ID, your fingerprint or your PIN. With {org}&apos;s vouch, your income proofs say
            &ldquo;verified employee of {org}&rdquo;.
          </span>
          <ConfirmEmployer employer={stream.payer} employerName={org} />
        </div>
      )}
    </article>
  );
}

function WithdrawForm({ stream, symbol, available }: { stream: StreamRow; symbol: string; available: bigint }) {
  const { account, chainId, d } = useVeil();
  const publicClient = usePublicClient();
  const direct = useTx();
  const relay = useRelay();
  const tx = stream.stealthKey ? relay : direct;
  const [amount, setAmount] = useState("");
  // Stealth pay can go anywhere; the main wallet is the easy default, and the hint says what it costs
  const [destination, setDestination] = useState<string>(account ?? "");
  const [result, setResult] = useState<string>();

  let parsed: bigint | undefined;
  try {
    parsed = amount ? parseAmount(amount) : undefined;
  } catch {
    parsed = undefined;
  }
  const to = destination.trim();
  const toOk = !stream.stealthKey || isAddress(to);

  /** "All of it" uses the chain's own number, so a fast browser clock can't ask for too much */
  const amountToSend = async () => {
    const value =
      parsed ??
      ((await publicClient!.readContract({
        address: d!.payroll,
        abi: VeilPayrollAbi,
        functionName: "available",
        args: [stream.id],
      })) as bigint);
    if (value <= BigInt(0)) throw new Error("Nothing has streamed yet. Try again in a moment.");
    return value;
  };

  const withdraw = async () => {
    setResult(undefined);
    let value: bigint | undefined;
    const receipt = stream.stealthKey
      ? await relay.run(async () => {
          value = await amountToSend();
          const signer = privateKeyToAccount(stream.stealthKey!);
          const nonce = (await publicClient!.readContract({
            address: d!.payroll,
            abi: VeilPayrollAbi,
            functionName: "nonces",
            args: [signer.address],
          })) as bigint;
          const deadline = BigInt(Math.floor(Date.now() / 1000) + RELAY_DEADLINE_SECONDS);
          const signature = await signer.signTypedData({
            domain: payrollDomain(chainId!, d!.payroll),
            types: WITHDRAW_TYPES,
            primaryType: "Withdraw",
            message: { id: stream.id, amount: value, to: to as Address, nonce, deadline },
          });
          return { kind: "withdraw", id: String(stream.id), amount: String(value), to: to as Address, deadline: String(deadline), signature };
        })
      : await direct.run(async () => {
          value = await amountToSend();
          return { address: d!.payroll, abi: VeilPayrollAbi, functionName: "withdraw", args: [stream.id, value] };
        });
    if (!receipt || value === undefined) return;
    setResult(`Withdrew ${formatAmount(value)} ${symbol}.`);
    setAmount("");
  };

  const toMain = account && to.toLowerCase() === account.toLowerCase();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (toOk) void withdraw();
      }}
    >
      <div className={`grid gap-4 ${stream.stealthKey ? "md:grid-cols-[1fr_1.4fr_auto]" : "md:grid-cols-[1fr_auto]"} md:items-end`}>
        <Field label={`Amount (${symbol})`} hint={`Leave empty to withdraw everything available (${formatAmount(available)} ${symbol}).`}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="All of it" />
        </Field>
        {stream.stealthKey && (
          <Field
            label="Send to"
            hint={
              !isAddress(to)
                ? "Enter a wallet or exchange address."
                : toMain
                  ? "Your Veil wallet. Easy, but anyone can then link this salary to you."
                  : "To keep it private, use an exchange deposit address or a fresh wallet."
            }
          >
            <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="0x…" spellCheck={false} />
          </Field>
        )}
        <Button type="submit" disabled={tx.busy || !toOk || (!parsed && available <= BigInt(0))}>
          Withdraw
        </Button>
      </div>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
      {result && <p className="text-caption">{result}</p>}
    </form>
  );
}

/** 6 decimals with thousands separators, so the cents visibly move */
function formatSixDp(units: bigint): string {
  const [w, f = ""] = formatUnits(units, 6).split(".");
  return `${Number(w).toLocaleString("en-US")}.${f.padEnd(6, "0")}`;
}

/** On testnet a "month" is shortened so pay moves visibly. Says how long it is, or nothing for a real month. */
function demoMonth(period: number): string | undefined {
  if (period >= 28 * 24 * 3600) return undefined;
  const minutes = period / 60;
  return `On this testnet a "month" is ${minutes >= 1 ? `${minutes} minutes` : `${period} seconds`}`;
}

/** Why this period's pay is less than the salary: started mid-period, or the employer's budget fell short */
function fundingNote(stream: StreamRow, period: number, monthly: bigint, total: bigint, org: string, symbol: string): string | undefined {
  // What a full budget would have set aside for the time left in the period
  const due = (monthly * (stream.allocEnd - stream.allocStart)) / BigInt(period);
  if (total < due) return `${org} set aside ${formatAmount(total)} of the ${formatAmount(due)} ${symbol} due this period.`;
  if (due < monthly) return "Pro rata: your pay started partway through this period.";
  return undefined;
}
