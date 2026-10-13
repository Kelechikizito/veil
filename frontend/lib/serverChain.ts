import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { defaultChain, rpcUrls } from "./chains";
import { addresses } from "./contracts/addresses";

/*
 * Shared plumbing for Veil's read-only JSON API (/api/credential, /api/org).
 * Errors carry a stable `error` code agents can match on, plus a plain `message` (see /docs/api).
 */

export type ServerDeployment = {
  payroll: `0x${string}`;
  incomeCredential: `0x${string}`;
  approvalPolicy: `0x${string}`;
  usdc: `0x${string}`;
  period: number;
};

/** Veil's deployment on its chain, or undefined before deploy */
export function serverDeployment(): ServerDeployment | undefined {
  const d = (addresses as Record<string, Partial<ServerDeployment> | undefined>)[String(defaultChain.id)];
  return d?.payroll && d.incomeCredential && d.usdc && d.period ? (d as ServerDeployment) : undefined;
}

/** A public client for Veil's chain. Prefers the server-only RPC, like /api/relay */
export function serverClient() {
  return createPublicClient({
    chain: defaultChain,
    transport: http(process.env.MONAD_TESTNET_RPC_URL || rpcUrls[defaultChain.id]),
  });
}

export type ApiError = "not_deployed" | "bad_request" | "not_found" | "rpc_error";

const STATUS: Record<ApiError, number> = { not_deployed: 503, bad_request: 400, not_found: 404, rpc_error: 502 };

/** A JSON error response */
export function apiError(error: ApiError, message: string) {
  return NextResponse.json({ error, message }, { status: STATUS[error], headers: CORS });
}

/** Read endpoints are public data: any origin may call them */
export const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

/** Token units → a decimal string ("2500", "96.1") */
export function units(value: bigint, decimals = 6): string {
  const base = BigInt(10) ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Unix seconds → ISO string */
export const iso = (seconds: bigint | number) => new Date(Number(seconds) * 1000).toISOString();
