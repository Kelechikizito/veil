import type { Hex } from "viem";

/*
 * Server only. Sends transactions from a Privy server wallet with gas sponsored, through Privy's REST API
 * (https://docs.privy.io/api-reference/wallets/ethereum/eth-send-transaction). The wallet is app-owned:
 * the app secret authorises it, and no private key exists on our server. Used by /api/relay.
 */

const API = "https://api.privy.io/v1";

/** How long to wait for a sponsored transaction to land before giving up */
const CONFIRM_TIMEOUT_MS = 60_000;
const POLL_MS = 1_000;

/** Privy credentials and the relayer wallet, from the server env; undefined when not configured */
export function privyRelayer(): { appId: string; secret: string; walletId: string } | undefined {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  const walletId = process.env.PRIVY_RELAYER_WALLET_ID;
  return appId && secret && walletId ? { appId, secret, walletId } : undefined;
}

/**
 * Sends `data` to `to` from the Privy wallet, sponsored, and returns the onchain hash once Privy has it.
 * A sponsored send returns before its hash exists, so this polls the transaction until it's confirmed.
 */
export async function sendSponsored(
  relayer: { appId: string; secret: string; walletId: string },
  chainId: number,
  to: Hex,
  data: Hex,
): Promise<Hex> {
  const headers = {
    Authorization: `Basic ${Buffer.from(`${relayer.appId}:${relayer.secret}`).toString("base64")}`,
    "privy-app-id": relayer.appId,
    "Content-Type": "application/json",
  };

  const sent = await fetch(`${API}/wallets/${relayer.walletId}/rpc`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      method: "eth_sendTransaction",
      caip2: `eip155:${chainId}`,
      chain_type: "ethereum",
      sponsor: true,
      params: { transaction: { to, data } },
    }),
  });
  const body = (await sent.json()) as { data?: { hash?: string; transaction_id?: string }; error?: string; message?: string };
  if (!sent.ok) throw new Error(`Privy rejected the transaction: ${body.error ?? body.message ?? sent.status}`);
  if (body.data?.hash) return body.data.hash as Hex;
  const id = body.data?.transaction_id;
  if (!id) throw new Error("Privy returned no transaction id");

  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const res = await fetch(`${API}/transactions/${id}`, { headers });
    const tx = (await res.json()) as { status?: string; transaction_hash?: string };
    if (tx.transaction_hash) return tx.transaction_hash as Hex;
    if (tx.status === "failed" || tx.status === "execution_reverted") throw new Error("The sponsored transaction failed");
  }
  throw new Error("The sponsored transaction didn't confirm in time. Try again.");
}
