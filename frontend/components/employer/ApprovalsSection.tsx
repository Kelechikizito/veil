"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";
import { shortAddress } from "@/components/AuthButton";
import { Panel } from "@/components/forms";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useVeil } from "@/hooks/useVeil";
import { shortError, useTx } from "@/hooks/useTx";
import { ApprovalPolicyAbi, VeilPayrollAbi } from "@/lib/contracts/abis";
import { formatAmount } from "@/lib/tokens";
import { scanAllStreams, StreamStatus, type StreamRow } from "./streams";

type QueueItem = { stream: StreamRow; orgName: string; count: number; required: number; approved: boolean };

/**
 * Pending streams, across every org, where the connected account is an approver.
 * There's no onchain index of "orgs I approve for", so it scans every stream and keeps the pending ones.
 */
export function useApprovalQueue() {
  const { account, d } = useVeil();
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["approval-queue", d?.payroll, account],
    enabled: !!publicClient && !!account && !!d,
    refetchInterval: 15_000,
    queryFn: async (): Promise<QueueItem[]> => {
      const pending = (await scanAllStreams(publicClient!, d!.payroll)).filter((s) => s.status === StreamStatus.Pending);

      const items = await Promise.all(
        pending.map(async (s): Promise<QueueItem | undefined> => {
          const id = s.id;
          const read = <F extends "isApprover" | "approvalCount" | "required" | "hasApproved">(functionName: F, args: readonly unknown[]) =>
            publicClient!.readContract({ address: d!.approvalPolicy, abi: ApprovalPolicyAbi, functionName, args } as never);
          const isApprover = (await read("isApprover", [s.payer, account])) as boolean;
          if (!isApprover) return undefined;
          const [count, required, approved, org] = await Promise.all([
            read("approvalCount", [s.payer, id]) as Promise<number>,
            read("required", [s.payer]) as Promise<number>,
            read("hasApproved", [s.payer, id, account]) as Promise<boolean>,
            publicClient!.readContract({ address: d!.payroll, abi: VeilPayrollAbi, functionName: "orgOf", args: [s.payer] }),
          ]);
          return { stream: s, orgName: org.name, count: Number(count), required: Number(required), approved };
        }),
      );
      return items.filter((i): i is QueueItem => !!i);
    },
  });
}

/** §6 Approvals: approve pending streams, then activate them once they have enough approvals */
export function ApprovalsSection() {
  const { d, tokens } = useVeil();
  const { data: queue, isLoading, error, refetch } = useApprovalQueue();
  const tx = useTx();
  const symbolOf = (token: Address) => tokens.find((t) => t.address.toLowerCase() === token.toLowerCase())?.symbol ?? "?";

  const approve = async (payer: Address, id: bigint) => {
    await tx.run(() => ({ address: d!.approvalPolicy, abi: ApprovalPolicyAbi, functionName: "approve", args: [payer, id] }));
    void refetch();
  };
  const activate = async (id: bigint) => {
    await tx.run(() => ({ address: d!.payroll, abi: VeilPayrollAbi, functionName: "activateApproved", args: [id] }));
    void refetch();
  };

  return (
    <Panel
      title="Approvals"
      help="Salaries above an org's threshold, where you're one of the approvers."
    >
      {isLoading ? (
        <p className="text-caption text-carbon/55">Looking for pending streams…</p>
      ) : error ? (
        <p className="text-caption text-carbon/70">Couldn&apos;t load pending streams: {shortError(error)}</p>
      ) : !queue || queue.length === 0 ? (
        <p className="text-caption text-carbon/55">Nothing waiting for your approval.</p>
      ) : (
        <ul className="flex flex-col">
          {queue.map(({ stream: s, orgName, count, required, approved }) => (
            <li key={String(s.id)} className="flex flex-wrap items-center justify-between gap-4 border-t border-carbon/10 py-4">
              <div className="flex flex-col gap-1">
                <span>
                  {orgName} · stream #{String(s.id)} · {formatAmount(s.monthly)} {symbolOf(s.token)} a month
                </span>
                <span className="text-caption text-carbon/70">
                  {shortAddress(s.payer)} → {shortAddress(s.payee)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-caption">
                  {count} of {required} approvals
                </span>
                {count >= required ? (
                  <Button disabled={tx.busy} onClick={() => void activate(s.id)}>
                    Activate
                  </Button>
                ) : approved ? (
                  <span className="text-caption text-carbon/55">✓ You approved</span>
                ) : (
                  <Button variant="outline" disabled={tx.busy} onClick={() => void approve(s.payer, s.id)}>
                    Approve
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </Panel>
  );
}
