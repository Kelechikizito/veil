import { NextResponse } from "next/server";
import { IncomeCredentialAbi, VeilPayrollAbi } from "@/lib/contracts/abis";
import { CORS, apiError, iso, serverClient, serverDeployment, units } from "@/lib/serverChain";
import { tokensFor } from "@/lib/tokens";
import { defaultChain } from "@/lib/chains";

/*
 * GET /api/credential/{id}: an income proof as JSON, for verifiers' agents (docs: /docs/api).
 * `valid` is the contract's own isValid; `answer` is the proof's yes/no, fixed when it was issued.
 */

type Credential = {
  payee: `0x${string}`;
  payer: `0x${string}`;
  verifier: `0x${string}`;
  token: `0x${string}`;
  streamId: bigint;
  threshold: bigint;
  issuedAt: bigint;
  expiresAt: bigint;
  revoked: boolean;
  employeeVerified: boolean;
  ok: boolean;
};

export async function GET(request: Request, ctx: RouteContext<"/api/credential/[id]">) {
  const { id } = await ctx.params;
  const d = serverDeployment();
  if (!d) return apiError("not_deployed", "Veil isn't deployed on this network yet.");
  if (!/^\d{1,20}$/.test(id)) return apiError("bad_request", "A credential id is a whole number, like 7.");

  const client = serverClient();
  let c: Credential;
  let valid: boolean;
  try {
    [c, valid] = (await Promise.all([
      client.readContract({ address: d.incomeCredential, abi: IncomeCredentialAbi, functionName: "get", args: [BigInt(id)] }),
      client.readContract({ address: d.incomeCredential, abi: IncomeCredentialAbi, functionName: "isValid", args: [BigInt(id)] }),
    ])) as [Credential, boolean];
  } catch {
    return apiError("rpc_error", "Couldn't read the chain. Try again.");
  }
  if (c.payee === "0x0000000000000000000000000000000000000000") return apiError("not_found", `Credential ${id} doesn't exist.`);

  let name: string | undefined;
  try {
    const org = (await client.readContract({ address: d.payroll, abi: VeilPayrollAbi, functionName: "orgOf", args: [c.payer] })) as {
      name: string;
    };
    name = org.name || undefined;
  } catch {
    // The name is a nicety; the proof stands without it
  }

  const token = tokensFor(defaultChain.id).find((t) => t.address.toLowerCase() === c.token.toLowerCase());
  const unit = token?.symbol ?? "tokens";
  const threshold = units(c.threshold, token?.decimals ?? 6);
  const origin = new URL(request.url).origin;

  return NextResponse.json(
    {
      id,
      valid,
      answer: c.ok,
      question: `Earns at least ${threshold} ${unit} a month?`,
      threshold,
      unit,
      employer: { address: c.payer, name: name ?? null },
      employeeVerified: c.employeeVerified,
      verifier: c.verifier,
      issuedAt: iso(c.issuedAt),
      expiresAt: iso(c.expiresAt),
      revoked: c.revoked,
      link: `${origin}/verify/${id}`,
    },
    { headers: CORS },
  );
}
