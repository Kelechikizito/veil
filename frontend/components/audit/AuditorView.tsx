"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { scanAllStreams, StreamStatus, statusLabel, type StreamRow } from "@/components/employer/streams";
import { Field, Input, Panel, PillPicker } from "@/components/forms";
import { Button } from "@/components/ui";
import { useVeil } from "@/hooks/useVeil";
import { shortError } from "@/hooks/useTx";
import { AuditRegistryAbi, VeilPayrollAbi } from "@/lib/contracts/abis";
import { formatAmount } from "@/lib/tokens";

type Books = {
  orgName: string;
  streams: StreamRow[];
  vaults: { symbol: string; balance: bigint }[];
};

/**
 * The auditor view (12 B). Lists the orgs that appointed the connected wallet, then shows that org's
 * salaries, withdrawals and vaults. The CSV is built locally: this page uploads nothing.
 */
export function AuditorView() {
  const { account, d } = useVeil();
  const publicClient = usePublicClient();
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<Address>();

  // Orgs that name me as auditor. No index of "orgs I audit" and no log search (RPC block-range caps),
  // so it checks every employer that has a stream. One with no streams yet: type its address below.
  const appointed = useQuery({
    queryKey: ["audit-orgs", d?.auditRegistry, account],
    enabled: !!publicClient && !!account && !!d,
    queryFn: async () => {
      const streams = await scanAllStreams(publicClient!, d!.payroll);
      const payers = [...new Set(streams.map((s) => s.payer))];
      const rows = await Promise.all(
        payers.map(async (payer) => {
          const [still, org] = await Promise.all([
            publicClient!.readContract({ address: d!.auditRegistry, abi: AuditRegistryAbi, functionName: "isAuditor", args: [payer, account!] }),
            publicClient!.readContract({ address: d!.payroll, abi: VeilPayrollAbi, functionName: "orgOf", args: [payer] }),
          ]);
          return still ? { payer, name: org.exists ? org.name : shortAddress(payer) } : undefined;
        }),
      );
      return rows.filter((r): r is { payer: Address; name: string } => !!r);
    },
  });

  const orgs = appointed.data ?? [];
  const payer = picked ?? (orgs.length === 1 ? orgs[0].payer : undefined);

  return (
    <div className="flex flex-col gap-8">
      <Panel title="Organisations you audit" help="An employer adds you as their auditor. You can read their payroll from that moment on.">
        {appointed.isLoading ? (
          <p className="text-caption text-carbon/55">Looking for organisations…</p>
        ) : appointed.error ? (
          <p className="text-caption text-carbon/70">Couldn&apos;t look for organisations: {shortError(appointed.error)}</p>
        ) : orgs.length === 0 ? (
          <p className="text-caption text-carbon/55">
            No employer with salary streams has named you yet. Send them your address: {account}. If they have no streams
            yet, enter their address below.
          </p>
        ) : (
          <PillPicker
            options={orgs.map((o) => ({ value: o.payer, label: o.name }))}
            value={payer ?? ("" as Address)}
            onChange={(p) => setPicked(p)}
          />
        )}
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (isAddress(typed.trim())) setPicked(typed.trim() as Address);
          }}
        >
          <div className="flex-1">
            <Field label="Or enter an employer's address">
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="0x…" />
            </Field>
          </div>
          <Button type="submit" variant="outline" disabled={!isAddress(typed.trim())}>
            Open
          </Button>
        </form>
      </Panel>
      {payer && <OrgBooks key={payer} payer={payer} />}
    </div>
  );
}

/** One org's books: salaries, what was set aside and paid, vaults, and a CSV export */
function OrgBooks({ payer }: { payer: Address }) {
  const { account, d, tokens } = useVeil();
  const publicClient = usePublicClient();

  const books = useQuery({
    queryKey: ["audit-books", d?.payroll, payer, account],
    enabled: !!publicClient && !!account && !!d,
    queryFn: async (): Promise<Books & { allowed: boolean }> => {
      const read = publicClient!.readContract;
      const [allowed, org, ids] = await Promise.all([
        read({ address: d!.auditRegistry, abi: AuditRegistryAbi, functionName: "isAuditor", args: [payer, account!] }),
        read({ address: d!.payroll, abi: VeilPayrollAbi, functionName: "orgOf", args: [payer] }),
        read({ address: d!.payroll, abi: VeilPayrollAbi, functionName: "streamsOfPayer", args: [payer] }),
      ]);
      const streams = await Promise.all(
        ids.map(async (id) => ({
          id,
          ...((await read({ address: d!.payroll, abi: VeilPayrollAbi, functionName: "getStream", args: [id] })) as Omit<StreamRow, "id">),
        })),
      );
      const vaults = await Promise.all(
        tokens.map(async (t) => ({
          symbol: t.symbol,
          balance: (await read({ address: d!.payroll, abi: VeilPayrollAbi, functionName: "vaultOf", args: [payer, t.address] })) as bigint,
        })),
      );
      return {
        allowed,
        orgName: org.exists ? org.name : shortAddress(payer),
        streams: streams.reverse(),
        vaults,
      };
    },
  });

  const b = books.data;
  if (books.isLoading) return <p className="text-caption text-carbon/55">Reading {shortAddress(payer)}&apos;s payroll…</p>;
  if (!b) {
    return (
      <p className="text-caption text-carbon/70">
        Couldn&apos;t read this payroll{books.error ? `: ${shortError(books.error)}` : "."}
      </p>
    );
  }
  if (!b.allowed) {
    return (
      <Panel title={b.orgName} help="">
        <p className="text-carbon/70">You aren&apos;t an auditor for this organisation.</p>
      </Panel>
    );
  }

  const symbolOf = (token: Address) => tokens.find((t) => t.address.toLowerCase() === token.toLowerCase())?.symbol ?? "?";

  const exportCsv = () => {
    const header = ["stream", "payee", "token", "status", "monthly", "set aside (latest run)", "withdrawn", "started"];
    const rows = b.streams.map((s) => [
      String(s.id),
      s.payee,
      symbolOf(s.token),
      statusLabel[s.status] ?? String(s.status),
      formatAmount(s.monthly, 6, 6),
      formatAmount(s.allocated, 6, 6),
      formatAmount(s.withdrawn, 6, 6),
      s.startTime > BigInt(0) ? new Date(Number(s.startTime) * 1000).toISOString() : "",
    ]);
    const vaultRows = b.vaults.map((v) => ["vault", payer, v.symbol, "", "", "", "", "", formatAmount(v.balance, 6, 6)]);
    const csv = [header, ...rows, [], ["vault", "payer", "token", "", "", "", "", "", "balance"], ...vaultRows]
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    // Built and saved in the browser: no request leaves this page
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${b.orgName.replace(/[^\w-]+/g, "-")}-payroll.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel title={b.orgName} help="Every salary, what each payroll run set aside, and what each employee withdrew.">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>
      <p className="text-caption text-carbon/70">The CSV is made on your computer. Nothing is uploaded.</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead className="text-caption text-carbon/55">
            <tr>
              <th className="py-2 font-normal">#</th>
              <th className="py-2 font-normal">Employee</th>
              <th className="py-2 font-normal">Token</th>
              <th className="py-2 font-normal">Status</th>
              <th className="py-2 font-normal">Monthly</th>
              <th className="py-2 font-normal">Set aside</th>
              <th className="py-2 font-normal">Withdrawn</th>
            </tr>
          </thead>
          <tbody>
            {b.streams.length === 0 ? (
              <tr>
                <td colSpan={7} className="border-t border-carbon/10 py-4 text-caption text-carbon/55">
                  No salary streams yet.
                </td>
              </tr>
            ) : (
              b.streams.map((s) => (
                <tr key={String(s.id)} className="border-t border-carbon/10">
                  <td className="py-3">{String(s.id)}</td>
                  <td className="py-3 font-mono text-caption">{shortAddress(s.payee)}</td>
                  <td className="py-3">{symbolOf(s.token)}</td>
                  <td className="py-3">{s.status === StreamStatus.None ? "—" : statusLabel[s.status]}</td>
                  <td className="py-3 tabular-nums">{formatAmount(s.monthly)}</td>
                  <td className="py-3 tabular-nums">{formatAmount(s.allocated)}</td>
                  <td className="py-3 tabular-nums">{formatAmount(s.withdrawn)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {b.vaults.map((v) => (
          <span key={v.symbol} className="text-caption">
            {v.symbol} vault: <span className="tabular-nums">{formatAmount(v.balance)}</span>
          </span>
        ))}
      </div>
    </Panel>
  );
}
