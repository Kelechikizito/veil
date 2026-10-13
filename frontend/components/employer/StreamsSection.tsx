"use client";

import { useState } from "react";
import { decodeEventLog, isAddress, type Address } from "viem";
import { shortAddress } from "@/components/AuthButton";
import { EmployeeBadge, VouchButton } from "@/components/Employment";
import { Field, Input, Panel, PillPicker } from "@/components/forms";
import { TxStatus } from "@/components/TxStatus";
import { Badge, Button } from "@/components/ui";
import { useVeil } from "@/hooks/useVeil";
import { useMetaAddressOf } from "@/hooks/useStealth";
import { useTx } from "@/hooks/useTx";
import { VeilPayrollAbi } from "@/lib/contracts/abis";
import { shortLink } from "@/lib/format";
import { payeeOf, rememberPayee } from "@/lib/payeeLabels";
import { generateStealthAddress } from "@/lib/stealth";
import { formatAmount, parseAmount, type TokenKey } from "@/lib/tokens";
import { JoinRequestsList } from "./JoinRequestsList";
import { fundedThisPeriod, StreamStatus, statusLabel, useStreamsOfPayer } from "./streams";
import { useChainNow } from "@/components/worker/hooks";

const inviteKey = (payer: string) => `veil:invite-copied:${payer.toLowerCase()}`;

/** Whether this employer copied their invite link before (a UX hint only) */
export function inviteCopied(payer: string | undefined): boolean {
  if (!payer) return false;
  try {
    return localStorage.getItem(inviteKey(payer)) === "1";
  } catch {
    return false;
  }
}

/** Copies `<app>/onboarding/employee?org=<payer>`. The link holds only the org address. */
export function InviteLink({ onCopied }: { onCopied?: () => void }) {
  const { account } = useVeil();
  const [copied, setCopied] = useState(false);
  if (!account || typeof window === "undefined") return null;
  const link = `${window.location.origin}/onboarding/employee?org=${account}`;

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    try {
      localStorage.setItem(inviteKey(account), "1");
    } catch {}
    setCopied(true);
    onCopied?.();
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-gloss-white p-5">
      <span className="text-caption text-mid-grey">Invite link: no salary, no secret, just your org</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="flex-1 font-mono text-caption" title={link}>
          {shortLink(link)}
        </code>
        <Button variant="outline" onClick={copy}>
          {copied ? "✓ Copied" : "Copy invite link"}
        </Button>
      </div>
    </div>
  );
}

/**
 * §5 Streams: invite, create a stream, and the streams table.
 * @param initialPayee From a worker's "pay me" link (/employer?payee=0x…): pre-fills the New stream form
 */
export function StreamsSection({ initialPayee }: { initialPayee?: string }) {
  // A join request's "Set salary" (or a pay-me link) pre-fills New stream. Keyed so the form takes the new value.
  const [prefill, setPrefill] = useState(initialPayee);
  return (
    <Panel
      title="Salary streams"
      help="Each salary accrues every second once the stream is active."
    >
      <InviteLink />
      <JoinRequestsList
        onSetSalary={(employee) => {
          setPrefill(employee);
          document.getElementById("new-stream")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      />
      <CreateStreamForm key={prefill ?? "new"} initialPayee={prefill} />
      <StreamsTable />
    </Panel>
  );
}

function CreateStreamForm({ initialPayee }: { initialPayee?: string }) {
  const { account, d, tokens } = useVeil();
  const tx = useTx();
  const [payee, setPayee] = useState(initialPayee && isAddress(initialPayee) ? initialPayee : "");
  const [key, setKey] = useState<TokenKey>(tokens[0]?.key ?? "usdc");
  const [monthly, setMonthly] = useState("");
  const [outcome, setOutcome] = useState<string>();
  const token = tokens.find((t) => t.key === key);

  let parsed: bigint | undefined;
  try {
    parsed = monthly && token ? parseAmount(monthly, token.decimals) : undefined;
  } catch {
    parsed = undefined;
  }
  const payeeOk = isAddress(payee.trim());
  const valid = payeeOk && !!token && parsed !== undefined && parsed > BigInt(0);
  // A worker with private pay on gets a fresh one-time address; nobody else can tell the stream is theirs
  const { meta, isLoading: metaLoading } = useMetaAddressOf(payeeOk ? (payee.trim() as Address) : undefined);

  const create = async () => {
    setOutcome(undefined);
    const worker = payee.trim() as Address;
    let stealth: Address | undefined;
    const receipt = await tx.run(() => {
      if (!meta) {
        return { address: d!.payroll, abi: VeilPayrollAbi, functionName: "createStream", args: [worker, token!.address, parsed!] };
      }
      const g = generateStealthAddress(meta);
      stealth = g.stealthAddress;
      return {
        address: d!.payroll,
        abi: VeilPayrollAbi,
        functionName: "createStealthStream",
        args: [g.stealthAddress, token!.address, parsed!, g.ephemeralPubKey, g.viewTag],
      };
    });
    if (!receipt) return;
    if (stealth) rememberPayee(stealth, worker);

    // The new id is in the StreamCreated event
    const created = receipt.logs
      .map((log) => {
        try {
          return decodeEventLog({ abi: VeilPayrollAbi, data: log.data, topics: log.topics });
        } catch {
          return undefined;
        }
      })
      .filter((e) => e !== undefined);
    const createdEvent = created.find((e) => e.eventName === "StreamCreated");
    const id = createdEvent && "id" in createdEvent.args ? (createdEvent.args.id as bigint) : undefined;
    const pending = created.some((e) => e.eventName === "StreamPending");
    if (id !== undefined) {
      setOutcome(
        pending
          ? `Stream #${id} is above your threshold. It's waiting for approvals.`
          : `Stream #${id} is active. Run payroll below to set its pay aside.`,
      );
    }
    setPayee("");
    setMonthly("");
  };

  return (
    <form
      id="new-stream"
      className="flex flex-col gap-4 border-t-[1.5px] border-gloss-black pt-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void create();
      }}
    >
      <h3 className="text-body">New stream</h3>
      <div className={`grid gap-4 ${tokens.length > 1 ? "md:grid-cols-[1.4fr_auto_1fr]" : "md:grid-cols-[1.4fr_1fr]"}`}>
        <Field
          label="Employee wallet"
          hint={
            payeeOk ? (
              <span className="flex flex-col gap-1">
                <EmployeeBadge worker={payee.trim() as Address} employer={account} viewer="employer" />
                {!metaLoading && (
                  <span>
                    {meta
                      ? "Private pay is on: they're paid at a one-time address only they can link to them."
                      : "They haven't turned on private pay, so this salary will show against their wallet."}
                  </span>
                )}
              </span>
            ) : (
              "They send it to you after signing up."
            )
          }
        >
          <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="0x…" spellCheck={false} />
        </Field>
        {tokens.length > 1 && (
          <Field label="Token">
            <PillPicker options={tokens.map((t) => ({ value: t.key, label: t.symbol }))} value={key} onChange={setKey} />
          </Field>
        )}
        <Field label={`Monthly salary (${token?.symbol ?? ""})`}>
          <Input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="3000" />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={!valid || tx.busy}>
          Start stream
        </Button>
      </div>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
      {outcome && <p className="text-caption">{outcome}</p>}
    </form>
  );
}

function StreamsTable() {
  const { account, d, tokens } = useVeil();
  const { rows, isLoading } = useStreamsOfPayer();
  const tx = useTx();
  const now = useChainNow(5000);
  const tokenOf = (address: Address) => tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
  const symbolOf = (address: Address) => tokenOf(address)?.symbol ?? "?";
  const amount = (units: bigint, address: Address) => `${formatAmount(units, tokenOf(address)?.decimals)} ${symbolOf(address)}`;

  if (isLoading) return <p className="text-caption text-mid-grey">Loading streams…</p>;
  if (rows.length === 0) return <p className="text-caption text-mid-grey">No streams yet.</p>;

  const cancel = (id: bigint) =>
    tx.run(() => ({ address: d!.payroll, abi: VeilPayrollAbi, functionName: "cancelStream", args: [id] }));

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-caption">
          <thead className="text-mid-grey">
            <tr>
              {["#", "Employee", "Token", "Status", "Monthly", "This period", "Started", ""].map((h) => (
                <th key={h} className="pb-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={String(s.id)} className="border-t-[1.5px] border-gloss-black/10">
                <td className="py-3">{String(s.id)}</td>
                <td className="py-3">
                  <div className="flex flex-col gap-1">
                    <PayeeCell payee={s.payee} />
                    <EmployeeBadge worker={payeeOf(s.payee) ?? s.payee} employer={account} viewer="employer" />
                    {s.status !== StreamStatus.Cancelled && <VouchButton worker={payeeOf(s.payee) ?? s.payee} />}
                  </div>
                </td>
                <td className="py-3">{symbolOf(s.token)}</td>
                <td className="py-3">
                  <Badge>{statusLabel[s.status]}</Badge>
                </td>
                <td className="py-3">
                  <span className="tabular-nums">{amount(s.monthly, s.token)}</span>
                </td>
                <td className="py-3">
                  {s.status !== StreamStatus.Active ? (
                    <span className="text-soft-charcoal">—</span>
                  ) : d && fundedThisPeriod(s, now, d.period) ? (
                    <span className="flex flex-col gap-1">
                      <span className="text-soft-charcoal">set aside</span>
                      <span className="tabular-nums">{amount(s.allocated, s.token)}</span>
                    </span>
                  ) : (
                    <a href="#payroll" className="underline underline-offset-4">
                      not funded
                    </a>
                  )}
                </td>
                <td className="py-3">
                  {s.startTime > BigInt(0) ? (
                    new Date(Number(s.startTime) * 1000).toLocaleString()
                  ) : (
                    // Pay starts at activation, not at creation
                    <span className="text-soft-charcoal">{s.status === StreamStatus.Pending ? "once approved" : s.status === StreamStatus.Cancelled ? "never" : "not yet"}</span>
                  )}
                </td>
                <td className="py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {s.status !== StreamStatus.Cancelled && (
                      <Button variant="outline" disabled={tx.busy} onClick={() => void cancel(s.id)} className="!px-3 !py-1 text-caption">
                        Cancel
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </div>
  );
}

/** The worker's wallet, or for a private stream the worker this browser paid, with its one-time address */
function PayeeCell({ payee }: { payee: Address }) {
  const worker = payeeOf(payee);
  if (!worker) {
    return (
      <span className="font-mono" title={payee}>
        {shortAddress(payee)}
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-mono" title={worker}>
        {shortAddress(worker)}
      </span>
      <span className="text-mid-grey" title={`Paid at the one-time address ${payee}`}>
        private · {shortAddress(payee)}
      </span>
    </span>
  );
}
