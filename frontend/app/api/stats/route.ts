import { NextResponse } from "next/server";
import { VeilPayrollAbi } from "@/lib/contracts/abis";
import { CORS, apiError, iso, serverClient, serverDeployment, units } from "@/lib/serverChain";

/*
 * GET /api/stats: Veil on Monad at a glance, for the landing page's live section and for agents.
 * Reads the latest streams straight from the contract (one multicall). All public onchain: amounts and payees.
 * `private` says whether a stream pays a one-time stealth address (nobody can tell whose it is) or a worker's
 * own wallet (the worker hadn't turned on private pay).
 */

const LATEST = 100; // streams read for the totals
const ROWS = 10; // streams returned as rows

type Stream = { payer: `0x${string}`; payee: `0x${string}`; monthly: bigint; status: number; startTime: bigint };

const STATUS = ["none", "pending", "active", "cancelled"] as const;

export async function GET() {
  const d = serverDeployment();
  if (!d) return apiError("not_deployed", "Veil isn't deployed on this network yet.");
  const client = serverClient();

  try {
    const count = (await client.readContract({ address: d.payroll, abi: VeilPayrollAbi, functionName: "streamCount" })) as bigint;
    // Ids start at 1; read the newest first
    const ids: bigint[] = [];
    for (let id = count; id >= BigInt(1) && ids.length < LATEST; id--) ids.push(id);

    const streams = (
      await client.multicall({
        contracts: ids.map((id) => ({ address: d.payroll, abi: VeilPayrollAbi, functionName: "getStream", args: [id] }) as const),
        allowFailure: false,
      })
    ) as unknown as Stream[];

    const payers = [...new Set(streams.map((s) => s.payer))];
    const orgs = (await client.multicall({
      contracts: payers.map((p) => ({ address: d.payroll, abi: VeilPayrollAbi, functionName: "orgOf", args: [p] }) as const),
      allowFailure: true,
    })) as { result?: { name: string } }[];
    const nameOf = new Map(payers.map((p, i) => [p, orgs[i]?.result?.name || null]));

    const rows = streams.slice(0, ROWS);
    const announcements = (await client.multicall({
      contracts: rows.map((_, i) => ({ address: d.payroll, abi: VeilPayrollAbi, functionName: "announcementOf", args: [ids[i]] }) as const),
      allowFailure: true,
    })) as { result?: { ephemeralPubKey: `0x${string}` } }[];

    const active = streams.filter((s) => s.status === 2);
    const monthly = active.reduce((sum, s) => sum + s.monthly, BigInt(0));

    return NextResponse.json(
      {
        streams: Number(count),
        scanned: streams.length,
        active: active.length,
        pending: streams.filter((s) => s.status === 1).length,
        employers: payers.length,
        monthlyStreaming: units(monthly),
        token: "USDC",
        latest: rows.map((s, i) => ({
          id: ids[i].toString(),
          employer: { address: s.payer, name: nameOf.get(s.payer) ?? null },
          paidTo: s.payee,
          private: (announcements[i]?.result?.ephemeralPubKey ?? "0x") !== "0x",
          monthly: units(s.monthly),
          status: STATUS[s.status] ?? "none",
          startedAt: s.startTime > BigInt(0) ? iso(s.startTime) : null,
        })),
      },
      { headers: CORS },
    );
  } catch {
    return apiError("rpc_error", "Couldn't read the chain. Try again.");
  }
}
