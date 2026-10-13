import { NextResponse } from "next/server";
import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, encodeFunctionData, http, isAddress, isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainFor, isSupportedChainId, rpcUrls } from "@/lib/chains";
import { IncomeCredentialAbi, VeilPayrollAbi } from "@/lib/contracts/abis";
import { addresses } from "@/lib/contracts/addresses";
import { privyRelayer, sendSponsored } from "@/lib/privyServerWallet";
import type { RelayRequest } from "@/lib/relay";

/*
 * Sends a stealth payee's signed call and pays its gas, so their one-time address never holds MON and never
 * links to their main wallet. It only sends three functions on Veil's own contracts, each of which checks the
 * payee's signature onchain. It simulates first, so a bad request costs nothing.
 *
 * It sends from a Privy server wallet with gas sponsored (PRIVY_RELAYER_WALLET_ID), so no relayer key or MON
 * lives on this server. Without that, it falls back to RELAYER_PRIVATE_KEY, which pays gas itself.
 * Either way the relayer can't move anyone's pay: every call it sends is authorised by the payee.
 */

type DeploymentAddresses = { payroll?: Hex; incomeCredential?: Hex };

export async function POST(request: Request) {
  const privy = privyRelayer();
  const key = normalizeKey(process.env.RELAYER_PRIVATE_KEY);
  if (!privy && !key) return config("Set PRIVY_RELAYER_WALLET_ID, or RELAYER_PRIVATE_KEY as 32 hex bytes");

  let body: RelayRequest;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON");
  }

  if (!isSupportedChainId(body?.chainId)) return fail("Unsupported chain");
  const d = (addresses as Record<string, DeploymentAddresses>)[String(body.chainId)];
  if (!d?.payroll || !d.incomeCredential) return fail("Veil isn't deployed on this chain");
  if (!isHex(body.signature)) return fail("Invalid signature");

  let call;
  try {
    call = buildCall(body, d.payroll, d.incomeCredential);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Invalid request");
  }

  const chain = chainFor(body.chainId);
  const transport = http(process.env.MONAD_TESTNET_RPC_URL || rpcUrls[chain.id]);
  const publicClient = createPublicClient({ chain, transport });

  try {
    if (privy) {
      // Simulate from any address: these calls check the payee's signature, not the sender
      await publicClient.simulateContract(call as never);
      const hash = await sendSponsored(privy, chain.id, call.address, encodeFunctionData(call as never));
      return NextResponse.json({ hash });
    }
    const account = privateKeyToAccount(key!);
    const walletClient = createWalletClient({ chain, transport, account });
    const { request: tx } = await publicClient.simulateContract({ ...call, account } as never);
    const hash = await walletClient.writeContract(tx as never);
    return NextResponse.json({ hash });
  } catch (e) {
    return fail(revertReason(e));
  }
}

/** The contract call for a relay request. Throws on a malformed field. */
function buildCall(body: RelayRequest, payroll: Hex, credential: Hex) {
  const uint = (v: string) => {
    if (!/^\d+$/.test(v)) throw new Error("Invalid number");
    return BigInt(v);
  };
  switch (body.kind) {
    case "withdraw":
      if (!isAddress(body.to)) throw new Error("Invalid destination");
      return {
        address: payroll,
        abi: VeilPayrollAbi,
        functionName: "withdrawWithSig",
        args: [uint(body.id), uint(body.amount), body.to, uint(body.deadline), body.signature],
      } as const;
    case "issue":
      if (!isAddress(body.verifier)) throw new Error("Invalid verifier");
      return {
        address: credential,
        abi: IncomeCredentialAbi,
        functionName: "issueWithSig",
        args: [uint(body.streamId), body.verifier, uint(body.threshold), uint(body.expiresAt), uint(body.deadline), body.signature],
      } as const;
    case "revoke":
      return {
        address: credential,
        abi: IncomeCredentialAbi,
        functionName: "revokeWithSig",
        args: [uint(body.id), uint(body.deadline), body.signature],
      } as const;
    default:
      throw new Error("Unknown request");
  }
}

/** The custom error name from a revert, or a short message */
function revertReason(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((c) => c instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (revert?.data?.errorName) return revert.data.errorName;
    if (/insufficient funds/i.test(e.message)) return "The relayer is out of MON. Tell the Veil team.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

/** A 32-byte hex key from env, with or without 0x. Checked here so a bad value never reaches a viem error. */
function normalizeKey(value: string | undefined): Hex | undefined {
  if (!value) return undefined;
  const v = (value.trim().startsWith("0x") ? value.trim() : `0x${value.trim()}`) as Hex;
  return isHex(v) && v.length === 66 ? v : undefined;
}

/** A rejected request */
function fail(error: string, status = 400) {
  console.warn(`[relay] rejected: ${error}`);
  return NextResponse.json({ error }, { status });
}

/** A server misconfiguration. Names the key, never its value. */
function config(message: string) {
  console.error(`[relay] configuration: ${message}`);
  return NextResponse.json({ error: "The relayer is not configured on the server" }, { status: 500 });
}
