"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { Field, Input, Panel } from "@/components/forms";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useVeil } from "@/hooks/useVeil";
import { useTx } from "@/hooks/useTx";
import { AuditRegistryAbi } from "@/lib/contracts/abis";
import { payeeOf } from "@/lib/payeeLabels";
import { useStreamsOfPayer } from "./streams";

/** Reads the connected employer's auditors */
export function useAuditors() {
  const { account, d } = useVeil();
  const { data } = useReadContract({
    address: d?.auditRegistry,
    abi: AuditRegistryAbi,
    functionName: "auditorsOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account && !!d },
  });
  return data ?? [];
}

/** §4 Auditors: add and remove the addresses that can read your payroll */
export function AuditorsSection() {
  const { d } = useVeil();
  const auditors = useAuditors();
  const [input, setInput] = useState("");
  const tx = useTx("auditor");
  const valid = isAddress(input.trim());

  const write = (functionName: "addAuditor" | "removeAuditor", who: Address) =>
    tx.run(() => ({ address: d!.auditRegistry, abi: AuditRegistryAbi, functionName, args: [who] }), {
      label: `${functionName === "addAuditor" ? "Added" : "Removed"} auditor ${shortAddress(who)}`,
    });

  return (
    <Panel
      title="Auditors"
      help="An auditor sees every salary, payroll run and withdrawal. For private salaries, hand them the payee list so they know who each one-time address pays."
    >
      {auditors.length > 0 && (
        <ul className="flex flex-col">
          {auditors.map((a) => (
            <li key={a} className="flex items-center justify-between border-t border-carbon/10 py-3">
              <span className="font-mono text-caption" title={a}>
                {shortAddress(a)}
              </span>
              <Button variant="outline" disabled={tx.busy} onClick={() => write("removeAuditor", a)} className="!px-4 !py-1.5 text-caption">
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void write("addAuditor", input.trim() as Address).then(() => setInput(""));
        }}
      >
        <div className="flex-1">
          <Field label="Auditor address">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x…" spellCheck={false} />
          </Field>
        </div>
        <Button type="submit" variant="dark" disabled={!valid || tx.busy}>
          Add auditor
        </Button>
      </form>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
      <PayeeListDownload />
    </Panel>
  );
}

/**
 * Downloads who each private salary pays: one-time address → worker wallet. Only this browser knows it,
 * so the employer hands the file to their auditor. Built locally; nothing is uploaded.
 */
export function PayeeListDownload() {
  const { rows } = useStreamsOfPayer();
  const known = rows.flatMap((s) => {
    const worker = payeeOf(s.payee);
    return worker ? [{ id: s.id, stealth: s.payee, worker }] : [];
  });
  if (known.length === 0) return null;

  const download = () => {
    const csv = [["stream", "one-time address", "worker wallet"], ...known.map((k) => [String(k.id), k.stealth, k.worker])]
      .map((r) => r.join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "veil-payee-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2 border-t border-carbon/10 pt-4">
      <span className="text-caption text-carbon/70">
        {known.length} private salar{known.length === 1 ? "y" : "ies"} created in this browser.
      </span>
      <div>
        <Button variant="outline" onClick={download} className="!px-4 !py-1.5 text-caption">
          Download payee list for your auditor
        </Button>
      </div>
    </div>
  );
}
