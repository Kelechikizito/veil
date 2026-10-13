"use client";

import type { Address } from "viem";
import { useAccount } from "wagmi";
import { addresses } from "@/lib/contracts/addresses";
import { tokensFor, type TokenInfo } from "@/lib/tokens";

/** Every address in one chain's deployment, as written by DeployScript */
export type Deployment = {
  payroll: Address;
  approvalPolicy: Address;
  auditRegistry: Address;
  employeeRegistry: Address;
  incomeCredential: Address;
  joinRequests: Address;
  stealthRegistry: Address;
  usdc: Address;
  period: number;
  deployBlock: number;
};

/** The deployment on a chain, or undefined before deploy */
export function deploymentFor(chainId: number | undefined): Deployment | undefined {
  return (addresses as Record<string, Deployment | undefined>)[String(chainId)];
}

/** The connected account, its chain, and Veil's deployment and tokens on that chain */
export function useVeil(): {
  account: Address | undefined;
  chainId: number | undefined;
  d: Deployment | undefined;
  tokens: TokenInfo[];
} {
  const { address, chainId } = useAccount();
  return { account: address, chainId, d: deploymentFor(chainId), tokens: tokensFor(chainId) };
}
