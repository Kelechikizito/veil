import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, concat, hexToBytes, keccak256, type Address, type Hex } from "viem";
import { publicKeyToAddress } from "viem/accounts";

/*
 * Stealth payees (ERC-5564 scheme 1: secp256k1 with view tags).
 *
 * The worker has two keys: spending (s) and viewing (v). Their meta-address, published in StealthRegistry,
 * is S‖V: the two compressed public keys. To pay them, the employer picks a random ephemeral key r and computes
 *   shared = r·V,  h = keccak256(shared),  stealth = address(S + h·G),  viewTag = h[0]
 * and publishes R = r·G with the stream. Only the worker can redo it (shared = v·R), and only they can spend
 * from the stealth address: its private key is s + h.
 *
 * The worker's keys come from a signature of their own wallet over a fixed message. Wallet signatures are
 * deterministic, so logging in again on a new device recovers the same keys. They're never stored.
 */

/** ERC-5564 scheme 1 */
export const STEALTH_SCHEME = BigInt(1);

/** What the worker signs to derive their stealth keys. Never change it: old payments would become unfindable. */
export const STEALTH_KEYS_MESSAGE =
  "Veil private pay\n\nSign to unlock your private pay keys. This doesn't send a transaction or cost gas.";

export type StealthKeys = {
  spendingKey: Hex;
  viewingKey: Hex;
  /** S‖V, 66 bytes */
  metaAddress: Hex;
};

const N = secp256k1.CURVE.n;
const G = secp256k1.ProjectivePoint.BASE;

/** A hash as a non-zero scalar mod n */
function scalarOf(hash: Hex): bigint {
  const v = BigInt(hash) % N;
  if (v === BigInt(0)) throw new Error("Unusable key material. Try again.");
  return v;
}

function scalarHex(v: bigint): Hex {
  return `0x${v.toString(16).padStart(64, "0")}`;
}

/** Derives the worker's spending and viewing keys from their wallet's signature of STEALTH_KEYS_MESSAGE */
export function keysFromSignature(signature: Hex): StealthKeys {
  const bytes = hexToBytes(signature);
  const spending = scalarOf(keccak256(bytes.slice(0, 32)));
  const viewing = scalarOf(keccak256(bytes.slice(32, 64)));
  const S = secp256k1.getPublicKey(spending, true);
  const V = secp256k1.getPublicKey(viewing, true);
  return { spendingKey: scalarHex(spending), viewingKey: scalarHex(viewing), metaAddress: concat([bytesToHex(S), bytesToHex(V)]) };
}

/** The hashed shared secret: keccak256 of the compressed shared point */
function sharedHash(privateKey: Hex | bigint, publicKey: Hex): Hex {
  const priv = typeof privateKey === "bigint" ? privateKey : BigInt(privateKey);
  return keccak256(secp256k1.getSharedSecret(scalarHex(priv).slice(2), publicKey.slice(2), true));
}

/** S + h·G as an address */
function stealthAddressOf(spendingPubKey: Hex, h: Hex): Address {
  const P = secp256k1.ProjectivePoint.fromHex(spendingPubKey.slice(2)).add(G.multiply(scalarOf(h)));
  return publicKeyToAddress(`0x${P.toHex(false)}`);
}

/** Splits a meta-address into its two compressed keys */
function splitMeta(metaAddress: Hex): { S: Hex; V: Hex } {
  const bytes = hexToBytes(metaAddress);
  if (bytes.length !== 66) throw new Error("Not a stealth meta-address");
  return { S: bytesToHex(bytes.slice(0, 33)), V: bytesToHex(bytes.slice(33)) };
}

/** Employer side: a fresh one-time address for the worker, and what to publish so they can find it */
export function generateStealthAddress(metaAddress: Hex): { stealthAddress: Address; ephemeralPubKey: Hex; viewTag: Hex } {
  const { S, V } = splitMeta(metaAddress);
  const r = BigInt(bytesToHex(secp256k1.utils.randomPrivateKey()));
  const h = sharedHash(r, V);
  return {
    stealthAddress: stealthAddressOf(S, h),
    ephemeralPubKey: bytesToHex(secp256k1.getPublicKey(scalarHex(r).slice(2), true)),
    viewTag: `0x${h.slice(2, 4)}`,
  };
}

/**
 * Worker side: whether a stealth stream is theirs. Returns the stealth address's private key if it is.
 * The view tag rules out about 255 in 256 strangers' streams before any curve maths.
 */
export function stealthKeyFor(keys: StealthKeys, ephemeralPubKey: Hex, viewTag: Hex, payee: Address): Hex | undefined {
  const h = sharedHash(keys.viewingKey, ephemeralPubKey);
  if (h.slice(2, 4).toLowerCase() !== viewTag.slice(2, 4).toLowerCase()) return undefined;
  const { S } = splitMeta(keys.metaAddress);
  if (stealthAddressOf(S, h).toLowerCase() !== payee.toLowerCase()) return undefined;
  return scalarHex((BigInt(keys.spendingKey) + scalarOf(h)) % N);
}
