import { formatUnits, parseUnits, type Address } from "viem";
import { addresses } from "./contracts/addresses";

/*
 * The tokens payroll pays in. Today that's one: a 6-decimal demo USDC anyone can mint on testnet.
 */

export type TokenKey = "usdc";

export type TokenInfo = {
  key: TokenKey;
  symbol: string;
  decimals: number;
  address: Address;
};

const META: Record<TokenKey, Omit<TokenInfo, "address">> = {
  usdc: { key: "usdc", symbol: "USDC", decimals: 6 },
};

type DeploymentRecord = Partial<Record<string, string | number>>;

/**
 * Returns the tokens deployed on a chain, or [] before deploy.
 * @param chainId The connected chain
 */
export function tokensFor(chainId: number | undefined): TokenInfo[] {
  const d = (addresses as Record<string, DeploymentRecord>)[String(chainId)];
  if (!d) return [];
  return (Object.keys(META) as TokenKey[])
    .filter((k) => typeof d[k] === "string")
    .map((k) => ({ ...META[k], address: d[k] as Address }));
}

/** Parses a user-typed amount ("1500.25") into token units */
export function parseAmount(value: string, decimals = 6): bigint {
  return parseUnits(value, decimals);
}

/** Formats token units for display, with at most `maxFraction` decimals */
export function formatAmount(units: bigint, decimals = 6, maxFraction = 2): string {
  const [whole, fraction = ""] = formatUnits(units, decimals).split(".");
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, "");
  return `${Number(whole).toLocaleString("en-US")}${trimmed ? `.${trimmed}` : ""}`;
}

/** Whether Veil is deployed on a chain */
export function isDeployedOn(chainId: number | undefined): boolean {
  return chainId !== undefined && String(chainId) in addresses;
}
