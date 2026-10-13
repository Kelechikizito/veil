"use client";

import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { EmployeeBadge } from "@/components/Employment";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useVeil } from "@/hooks/useVeil";
import { useTx } from "@/hooks/useTx";
import { JoinRequestsAbi } from "@/lib/contracts/abis";
import { StreamStatus, useStreamsOfPayer } from "./streams";

/**
 * Workers who asked this employer to pay them (JoinRequests). Anyone already paid by this employer is
 * hidden, so starting a stream clears the request from view without a second transaction.
 * @param onSetSalary Pre-fills the New stream form with the worker's address
 */
export function JoinRequestsList({ onSetSalary }: { onSetSalary: (employee: Address) => void }) {
  const { account, d } = useVeil();
  const { rows } = useStreamsOfPayer();
  const tx = useTx();
  const { data } = useReadContract({
    address: d?.joinRequests,
    abi: JoinRequestsAbi,
    functionName: "pendingFor",
    args: account ? [account] : undefined,
    query: { enabled: !!account && !!d?.joinRequests, refetchInterval: 15_000 },
  });

  const paid = new Set(rows.filter((s) => s.status !== StreamStatus.Cancelled).map((s) => s.payee.toLowerCase()));
  const pending = (data ?? []).filter((a) => !paid.has(a.toLowerCase()));
  if (!d?.joinRequests || pending.length === 0) return null;

  const dismiss = (employee: Address) =>
    tx.run(() => ({ address: d.joinRequests!, abi: JoinRequestsAbi, functionName: "dismiss", args: [employee] }));

  return (
    <div className="flex flex-col gap-3 rounded-cards border border-carbon p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-body">Join requests</h3>
        <span className="rounded-pills bg-carbon px-2 py-0.5 text-caption text-paper-white">{pending.length}</span>
      </div>
      <ul className="flex flex-col">
        {pending.map((employee) => (
          <li key={employee} className="flex flex-wrap items-center justify-between gap-3 border-t border-carbon/10 py-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-caption" title={employee}>
                {shortAddress(employee)}
              </span>
              <EmployeeBadge worker={employee} employer={account} viewer="employer" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => onSetSalary(employee)} className="!px-4 !py-1.5 text-caption">
                Set salary
              </Button>
              <Button variant="outline" disabled={tx.busy} onClick={() => void dismiss(employee)} className="!px-4 !py-1.5 text-caption">
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </div>
  );
}
