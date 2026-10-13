import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { VeilPayrollAbi } from "@/lib/contracts/abis";
import { CORS, apiError, iso, serverClient, serverDeployment, units } from "@/lib/serverChain";

/*
 * GET /api/org/{employer}: an employer's payroll at a glance, for agents (docs: /docs/api).
 * Vault, salaries, what this period still needs, and how many periods the vault covers.
 * All public onchain. It never says who a salary pays.
 */

type Stream = { monthly: bigint; status: number; allocEnd: bigint; token: `0x${string}` };

/** Mirrors IVeilPayroll.Status */
const PENDING = 1;
const ACTIVE = 2;
const CANCELLED = 3;

export async function GET(_request: Request, ctx: RouteContext<"/api/org/[address]">) {
  const { address } = await ctx.params;
  const d = serverDeployment();
  if (!d) return apiError("not_deployed", "Veil isn't deployed on this network yet.");
  if (!isAddress(address)) return apiError("bad_request", "That isn't an address.");
  const employer = getAddress(address);
  const client = serverClient();

  try {
    const [org, vault, ids] = (await Promise.all([
      client.readContract({ address: d.payroll, abi: VeilPayrollAbi, functionName: "orgOf", args: [employer] }),
      client.readContract({ address: d.payroll, abi: VeilPayrollAbi, functionName: "vaultOf", args: [employer, d.usdc] }),
      client.readContract({ address: d.payroll, abi: VeilPayrollAbi, functionName: "streamsOfPayer", args: [employer] }),
    ])) as [{ name: string; exists: boolean }, bigint, bigint[]];
    if (!org.exists) return apiError("not_found", "No Veil org at that address.");

    const streams = (await Promise.all(
      ids.map((id) => client.readContract({ address: d.payroll, abi: VeilPayrollAbi, functionName: "getStream", args: [id] })),
    )) as Stream[];

    // Same period math as the Run payroll screen: each unfunded salary, pro rata for the time left
    const period = BigInt(d.period);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const end = (now / period + BigInt(1)) * period;
    const usdc = d.usdc.toLowerCase();

    const pendingIds: string[] = [];
    const activeIds: string[] = [];
    const unfundedIds: string[] = [];
    let monthly = BigInt(0);
    let needed = BigInt(0);
    let cancelled = 0;
    streams.forEach((s, i) => {
      const id = ids[i].toString();
      if (s.status === PENDING) pendingIds.push(id);
      if (s.status === CANCELLED) cancelled++;
      if (s.status !== ACTIVE || s.token.toLowerCase() !== usdc) return;
      activeIds.push(id);
      monthly += s.monthly;
      if (s.allocEnd !== end) {
        unfundedIds.push(id);
        needed += (s.monthly * (end - now)) / period;
      }
    });

    return NextResponse.json(
      {
        employer,
        name: org.name,
        token: "USDC",
        vault: units(vault),
        monthlyActive: units(monthly),
        periodsCovered: monthly > BigInt(0) ? Math.round((Number(vault) / Number(monthly)) * 100) / 100 : null,
        neededThisPeriod: units(needed),
        streams: { active: activeIds.length, pending: pendingIds.length, cancelled },
        activeIds,
        unfundedIds,
        pendingIds,
        periodEndsAt: iso(end),
      },
      { headers: CORS },
    );
  } catch {
    return apiError("rpc_error", "Couldn't read the chain. Try again.");
  }
}
