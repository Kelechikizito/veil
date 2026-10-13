"use client";

import type { Address } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui";
import { useVeil } from "@/hooks/useVeil";
import { useTx } from "@/hooks/useTx";
import { EmployeeRegistryAbi } from "@/lib/contracts/abis";
import { createPasskey, passkeyErrorMessage, passkeysSupported, readPasskey, signWithPasskey } from "@/lib/passkey";

/*
 * Verified employment (EmployeeRegistry): the employer vouches, the worker confirms with a passkey.
 * Both sides have to agree. It proves who employs whom, not that the worker is a unique person.
 */

/** Whether `employer` vouched for `worker`, and whether `worker` confirmed `employer`. Undefined while loading. */
export function useEmployment(worker: Address | undefined, employer: Address | undefined) {
  const { d } = useVeil();
  const registry = d?.employeeRegistry;
  const enabled = !!registry && !!worker && !!employer;
  const { data } = useReadContracts({
    contracts: [
      { address: registry, abi: EmployeeRegistryAbi, functionName: "isVouched", args: enabled ? [worker, employer] : undefined },
      { address: registry, abi: EmployeeRegistryAbi, functionName: "isConfirmed", args: enabled ? [worker, employer] : undefined },
    ],
    query: { enabled, refetchInterval: 15_000 },
  });
  const vouched = data?.[0]?.result as boolean | undefined;
  const confirmed = data?.[1]?.result as boolean | undefined;
  return {
    available: !!registry,
    loading: enabled && (vouched === undefined || confirmed === undefined),
    vouched: !!vouched,
    confirmed: !!confirmed,
    verified: !!vouched && !!confirmed,
  };
}

/**
 * "✓ verified employee", or which side is still missing. For the employer's tables and the worker's stream card.
 * @param viewer Whose screen this is: the missing step is phrased for them
 */
export function EmployeeBadge({ worker, employer, viewer }: { worker: Address | undefined; employer: Address | undefined; viewer: "employer" | "worker" }) {
  const e = useEmployment(worker, employer);
  if (!e.available || e.loading) return null;
  if (e.verified) {
    return <span className="rounded-lg bg-gloss-black px-2 py-0.5 text-caption text-gloss-white">✓ verified employee</span>;
  }
  const missing =
    viewer === "employer"
      ? e.vouched
        ? "waiting for their passkey"
        : "not vouched for yet"
      : e.confirmed
        ? "waiting for your employer"
        : "not confirmed yet";
  return (
    <span className="rounded-lg border-[1.5px] border-gloss-black/20 px-2 py-0.5 text-caption text-soft-charcoal">{missing}</span>
  );
}

/** The employer vouches that `worker` works for them. Hidden once vouched. */
export function VouchButton({ worker }: { worker: Address }) {
  const { account, d } = useVeil();
  const e = useEmployment(worker, account);
  const tx = useTx();
  if (!d?.employeeRegistry || e.loading || e.vouched) return null;

  const vouch = () =>
    tx.run(() => ({ address: d.employeeRegistry!, abi: EmployeeRegistryAbi, functionName: "vouch", args: [worker] }));

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" disabled={tx.busy} onClick={() => void vouch()} className="!px-4 !py-1.5 text-caption">
        Vouch for them
      </Button>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </div>
  );
}

/**
 * The worker confirms, with a passkey, that they work for `employer`.
 * The first time on a device it makes a passkey (one prompt), then signs (a second prompt).
 */
export function ConfirmEmployer({ employer, employerName }: { employer: Address; employerName?: string }) {
  const { account, d } = useVeil();
  const publicClient = usePublicClient();
  const e = useEmployment(account, employer);
  const tx = useTx();

  if (!account || !d?.employeeRegistry || e.loading) return null;
  if (e.confirmed) {
    return <p>✓ You confirmed you work for {employerName ?? "this employer"}.</p>;
  }
  if (!passkeysSupported()) {
    return <p className="text-soft-charcoal">This browser can&apos;t use passkeys. Open Veil in Chrome, Safari or Edge to confirm.</p>;
  }

  const registry = d.employeeRegistry;
  const confirm = () =>
    tx.run(async () => {
      if (!publicClient) throw new Error("Not connected to the network");
      const challenge = await publicClient.readContract({
        address: registry,
        abi: EmployeeRegistryAbi,
        functionName: "challengeOf",
        args: [account, employer],
      });
      try {
        const passkey = readPasskey(account) ?? (await createPasskey(account, `Veil ${account.slice(0, 6)}…${account.slice(-4)}`));
        const assertion = await signWithPasskey(passkey, challenge);
        return {
          address: registry,
          abi: EmployeeRegistryAbi,
          functionName: "confirm",
          args: [employer, { x: passkey.x, y: passkey.y }, assertion],
        };
      } catch (err) {
        throw new Error(passkeyErrorMessage(err));
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => void confirm()} disabled={tx.busy}>
          Confirm with passkey
        </Button>
      </div>
      <TxStatus stage={tx.stage} error={tx.error} txHash={tx.hash} />
    </div>
  );
}
