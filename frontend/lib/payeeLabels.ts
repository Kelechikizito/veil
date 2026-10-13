import type { Address } from "viem";

/*
 * The employer's own memory of who each one-time address pays. Only their browser knows it: onchain,
 * a stealth stream shows nothing but the one-time address. Lost on another device; the stream still works.
 */

const key = (stealth: Address) => `veil:payee:${stealth.toLowerCase()}`;

/** Remembers that `stealth` pays `worker` */
export function rememberPayee(stealth: Address, worker: Address) {
  try {
    localStorage.setItem(key(stealth), worker);
  } catch {}
}

/** The worker a one-time address pays, if this browser created the stream */
export function payeeOf(stealth: Address): Address | undefined {
  try {
    return (localStorage.getItem(key(stealth)) as Address | null) ?? undefined;
  } catch {
    return undefined;
  }
}
