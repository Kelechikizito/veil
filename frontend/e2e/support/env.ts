import path from "node:path";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { createPublicClient, createWalletClient, formatEther, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

// E2E_FUNDER_PRIVATE_KEY lives in frontend/.env.e2e (gitignored); the app's own env stays in .env.local
try {
  process.loadEnvFile(path.join(__dirname, "../../.env.e2e"));
} catch {}
try {
  process.loadEnvFile(path.join(__dirname, "../../.env.local"));
} catch {}

const RPC = process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC || "https://testnet-rpc.monad.xyz";
export const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC) });

function funder() {
  const key = process.env.E2E_FUNDER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("Set E2E_FUNDER_PRIVATE_KEY in frontend/.env.e2e");
  return createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport: http(RPC) });
}

/** Tops `to` up to `min` MON from the funder. Monad charges gas on the limit, so leave headroom. */
export async function fund(to: Address, min: string) {
  const want = parseEther(min);
  const have = await publicClient.getBalance({ address: to });
  if (have >= want) return;
  const client = funder();
  const spare = await publicClient.getBalance({ address: client.account.address });
  if (spare < want - have) {
    throw new Error(
      `Funder ${client.account.address} has ${formatEther(spare)} MON; send it more testnet MON and re-run`,
    );
  }
  const hash = await client.sendTransaction({ to, value: want - have });
  await publicClient.waitForTransactionReceipt({ hash });
}

/**
 * A virtual platform authenticator, so passkey prompts resolve as if the user touched Touch ID.
 * Chromium only (CDP). Returns the authenticator id.
 */
export async function installPasskey(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return authenticatorId;
}

/** Privy test accounts (dashboard > Authentication > Advanced): fixed logins with a fixed code */
export const testAccounts = {
  employerEmail: process.env.E2E_EMPLOYER_EMAIL ?? "",
  workerPhone: process.env.E2E_WORKER_PHONE ?? "",
  otp: process.env.E2E_OTP ?? "",
};

/** Opens `url`, clicks the app's "Log in", and signs in with a Privy test email or phone number */
export async function login(page: Page, url: string, as: { email: string } | { phone: string }) {
  if (!testAccounts.otp) throw new Error("Set E2E_EMPLOYER_EMAIL, E2E_WORKER_PHONE and E2E_OTP in frontend/.env.e2e");
  await page.goto(url);
  await page.getByRole("button", { name: /^log in$/i }).first().click();
  const privy = page.locator("#privy-modal-content");
  await expect(privy).toBeVisible();
  if ("email" in as) {
    await privy.locator("input[type=email]").fill(as.email);
  } else {
    const tel = privy.locator("input[type=tel]");
    if (!(await tel.isVisible())) await privy.getByRole("button", { name: /continue with sms/i }).click();
    // Privy's country picker defaults to +1; type the national number
    await tel.fill(as.phone.replace(/^\+1\s*/, ""));
  }
  await privy.getByRole("button", { name: "Submit" }).click();
  const code = privy.getByText(/enter confirmation code/i);
  const refused = privy.getByText(/not allowed/i);
  await expect(code.or(refused).first()).toBeVisible();
  if (await refused.first().isVisible()) {
    throw new Error(`Privy refused the login: "${await refused.first().innerText()}". Enable that login method in the Privy dashboard.`);
  }
  await privy.locator("input").first().click();
  await page.keyboard.type(testAccounts.otp, { delay: 50 });
  await expect(privy).toBeHidden({ timeout: 60_000 });
}
