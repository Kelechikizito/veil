import { bytesToHex, hexToBytes, type Address, type Hex } from "viem";

/*
 * Passkeys for EmployeeRegistry.confirm. The browser signs a challenge, and the contract checks it
 * with Monad's P256 precompile. One passkey per wallet on this device, remembered in localStorage.
 * A new device or cleared storage makes a new passkey, and the next confirm replaces the old one onchain.
 */

/** A passkey's id and P256 public key */
export type StoredPasskey = { id: string; x: Hex; y: Hex };

/** The `WebAuthn.Assertion` struct EmployeeRegistry.confirm takes */
export type Assertion = {
  authenticatorData: Hex;
  clientDataJSON: string;
  challengeIndex: bigint;
  typeIndex: bigint;
  r: Hex;
  s: Hex;
};

/** The P256 curve order. A signature's s must be in the lower half for OpenZeppelin's P256. */
const N = BigInt("0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551");

const storageKey = (wallet: Address) => `veil:passkey:${wallet.toLowerCase()}`;

/** The passkey this device made for `wallet`, if any */
export function readPasskey(wallet: Address): StoredPasskey | undefined {
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    return raw ? (JSON.parse(raw) as StoredPasskey) : undefined;
  } catch {
    return undefined;
  }
}

function writePasskey(wallet: Address, passkey: StoredPasskey) {
  try {
    localStorage.setItem(storageKey(wallet), JSON.stringify(passkey));
  } catch {}
}

/** Whether this browser can make passkeys at all */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

/** Makes a new passkey for `wallet` (one Face ID, fingerprint or PIN prompt) and remembers it */
export async function createPasskey(wallet: Address, label: string): Promise<StoredPasskey> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Veil" },
      user: { id: random(16), name: label, displayName: label },
      challenge: random(32),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256: P256 with SHA-256
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("No passkey was created");

  // A P256 key in SPKI form ends with 0x04 || x || y
  const spki = (cred.response as AuthenticatorAttestationResponse).getPublicKey();
  if (!spki) throw new Error("This passkey can't be used here. Try another device or browser.");
  const point = new Uint8Array(spki).slice(-64);
  const passkey = { id: toBase64Url(new Uint8Array(cred.rawId)), x: bytesToHex(point.slice(0, 32)), y: bytesToHex(point.slice(32)) };
  writePasskey(wallet, passkey);
  return passkey;
}

/** Signs `challenge` with the given passkey (one prompt) and shapes the result for the contract */
export async function signWithPasskey(passkey: StoredPasskey, challenge: Hex): Promise<Assertion> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: copy(hexToBytes(challenge)),
      allowCredentials: [{ type: "public-key", id: fromBase64Url(passkey.id) }],
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("No passkey signature was returned");

  const res = cred.response as AuthenticatorAssertionResponse;
  const clientDataJSON = new TextDecoder().decode(res.clientDataJSON);
  const { r, s } = parseDerSignature(new Uint8Array(res.signature));
  return {
    authenticatorData: bytesToHex(new Uint8Array(res.authenticatorData)),
    clientDataJSON,
    challengeIndex: BigInt(clientDataJSON.indexOf('"challenge":"')),
    typeIndex: BigInt(clientDataJSON.indexOf('"type":"')),
    r: bytesToHex(r),
    s: bytesToHex(lowS(s)),
  };
}

/** A friendly message for a failed passkey prompt */
export function passkeyErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError") return "The passkey prompt was closed or timed out. Try again.";
  if (name === "InvalidStateError") return "This device already has a passkey for this account. Try again.";
  if (name === "SecurityError") return "Passkeys need a secure page (https or localhost).";
  if (name === "NotSupportedError") return "This browser can't use passkeys. Try Chrome, Safari or Edge.";
  return e instanceof Error ? e.message : String(e);
}

/*//////////////////////////////////////////////////////////////
                             ENCODING
//////////////////////////////////////////////////////////////*/

/** Splits a DER-encoded ECDSA signature (0x30 len 0x02 rLen r 0x02 sLen s) into 32-byte r and s */
function parseDerSignature(der: Uint8Array): { r: Uint8Array; s: Uint8Array } {
  let i = 2; // skip 0x30 and the total length
  const readInt = () => {
    if (der[i] !== 0x02) throw new Error("Unexpected passkey signature format");
    const len = der[i + 1];
    const value = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    return to32(value);
  };
  const r = readInt();
  const s = readInt();
  return { r, s };
}

/** Left-pads or strips a big-endian integer to exactly 32 bytes */
function to32(bytes: Uint8Array): Uint8Array {
  const trimmed = bytes.slice(Math.max(0, bytes.length - 32));
  const out = new Uint8Array(32);
  out.set(trimmed, 32 - trimmed.length);
  return out;
}

/** Flips s into the lower half of the curve order, which is the same signature */
function lowS(s: Uint8Array): Uint8Array {
  const value = BigInt(bytesToHex(s));
  if (value <= N / BigInt(2)) return s;
  return hexToBytes(`0x${(N - value).toString(16).padStart(64, "0")}`);
}

function random(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** A copy backed by a plain ArrayBuffer, which WebAuthn's types require */
function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
