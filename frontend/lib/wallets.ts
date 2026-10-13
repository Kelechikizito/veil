/** True for a wallet Privy made for the user (Google or email login). Privy reports these as "privy" or "privy-v2". */
export function isEmbeddedWallet(w: { walletClientType?: string }): boolean {
  return w.walletClientType === "privy" || w.walletClientType === "privy-v2";
}
