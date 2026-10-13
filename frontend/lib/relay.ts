import type { Address, Hex } from "viem";

/*
 * Signed calls a stealth payee sends through Veil's relayer, so their one-time address never needs gas.
 * The typed data must match VeilPayroll and IncomeCredential exactly: names, versions and type strings.
 * StealthTest builds its digests from the same strings.
 */

export const WITHDRAW_TYPES = {
  Withdraw: [
    { name: "id", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "to", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const ISSUE_TYPES = {
  Issue: [
    { name: "streamId", type: "uint256" },
    { name: "verifier", type: "address" },
    { name: "threshold", type: "uint256" },
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const REVOKE_TYPES = {
  Revoke: [
    { name: "id", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** EIP-712 domain of a deployed VeilPayroll */
export function payrollDomain(chainId: number, payroll: Address) {
  return { name: "Veil Payroll", version: "1", chainId, verifyingContract: payroll } as const;
}

/** EIP-712 domain of a deployed IncomeCredential */
export function credentialDomain(chainId: number, credential: Address) {
  return { name: "Veil IncomeCredential", version: "1", chainId, verifyingContract: credential } as const;
}

/** How long a relayed signature stays valid, in seconds */
export const RELAY_DEADLINE_SECONDS = 600;

/** What the browser posts to /api/relay. Numbers are decimal strings, since JSON has no bigint. */
export type RelayRequest = { chainId: number; signature: Hex; deadline: string } & (
  | { kind: "withdraw"; id: string; amount: string; to: Address }
  | { kind: "issue"; streamId: string; verifier: Address; threshold: string; expiresAt: string }
  | { kind: "revoke"; id: string }
);

/** What /api/relay returns */
export type RelayResponse = { hash: Hex } | { error: string };
