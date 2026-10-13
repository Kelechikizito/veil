import { expect, test, type Locator, type Page } from "@playwright/test";
import { installPasskey, login, testAccounts } from "./support/env";

/*
 * The whole Veil flow on Monad testnet, as two people in two browsers:
 * employer sets up and funds payroll, worker confirms with a passkey and turns on private pay,
 * employer starts a stealth stream and runs payroll, worker withdraws through the relayer and
 * issues an income proof, and the proof checks out on /verify.
 *
 * The Privy test accounts keep their wallets between runs, so every step accepts "already done".
 */

const SALARY = "3000";
const FUND = "10000";

/** Waits for `success`, failing fast with the app's own message if a transaction errors */
async function settle(page: Page, success: Locator, timeout = 120_000) {
  const failure = page.getByText(/^Something went wrong:/);
  await expect(success.or(failure).first()).toBeVisible({ timeout });
  if (await failure.first().isVisible()) throw new Error(await failure.first().innerText());
}

/** The logged-in wallet, from the header's copy button */
async function walletOf(page: Page) {
  const button = page.locator('button[title$="(click to copy)"]').first();
  await expect(button).toBeVisible();
  const title = (await button.getAttribute("title")) ?? "";
  const address = title.split(" ")[0];
  expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  return address;
}

test("employer pays a worker privately; worker withdraws and proves income", async ({ browser }) => {
  const employerCtx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const workerCtx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const employer = await employerCtx.newPage();
  const worker = await workerCtx.newPage();
  await installPasskey(workerCtx, worker);

  let employerAddress = "";
  let workerAddress = "";
  let streamId = "";
  let proofId = "";

  await test.step("employer signs in and has an organisation", async () => {
    await login(employer, "/employer", { email: testAccounts.employerEmail });
    employerAddress = await walletOf(employer);
    const console = employer.getByText("Salary streams");
    const noOrg = employer.getByText(/no organisation/i);
    await expect(console.or(noOrg).first()).toBeVisible({ timeout: 60_000 });
    if (await noOrg.first().isVisible()) {
      await employer.goto("/onboarding/employer");
      await employer.getByPlaceholder("Acme Labs").fill("Veil E2E Labs");
      await employer.getByRole("button", { name: "Create organisation" }).click();
      await settle(employer, employer.getByRole("heading", { name: /add funds/i }));
      await employer.goto("/employer");
      await expect(console).toBeVisible({ timeout: 60_000 });
    }
  });

  await test.step("employer funds the vault (test USDC is minted on the way)", async () => {
    const vault = employer.locator("#vault");
    await vault.getByPlaceholder("5000").fill(FUND);
    await vault.getByRole("button", { name: "Add to payroll" }).click();
    await settle(employer, vault.getByText(/✓ Added 10,000/));
  });

  await test.step("worker signs in from the invite link", async () => {
    await login(worker, `/onboarding/employee?org=${employerAddress}`, { phone: testAccounts.workerPhone });
    workerAddress = await walletOf(worker);
  });

  await test.step("worker confirms the employer with a passkey", async () => {
    const button = worker.getByRole("button", { name: "Confirm with passkey" });
    const done = worker.getByText(/✓ You confirmed you work for/);
    // A worker paid in an earlier run is sent straight to /worker; they confirmed back then
    await expect(button.or(done).or(worker.getByText("Paid by the second.")).first()).toBeVisible({ timeout: 60_000 });
    if (await button.isVisible()) {
      await button.click();
      await settle(worker, done);
    }
  });

  await test.step("worker turns on private pay", async () => {
    if (!worker.url().includes("/onboarding")) await worker.goto(`/onboarding/employee?org=${employerAddress}`);
    const on = worker.getByText(/✓ Private pay is on/);
    const turnOn = worker.getByRole("button", { name: /turn on private pay|update private pay/i });
    await expect(on.or(turnOn).or(worker.getByText("Paid by the second.")).first()).toBeVisible({ timeout: 60_000 });
    if (await turnOn.isVisible()) {
      await turnOn.click();
      await settle(worker, on);
    }
  });

  await test.step("employer starts a stealth stream and vouches for the worker", async () => {
    await employer.reload();
    const form = employer.locator("#new-stream");
    await form.getByPlaceholder("0x…").fill(workerAddress);
    await expect(form.getByText(/Private pay is on/)).toBeVisible({ timeout: 60_000 });
    await form.getByPlaceholder("3000").fill(SALARY);
    await form.getByRole("button", { name: "Start stream" }).click();
    const outcome = form.getByText(/Stream #\d+ is active/);
    await settle(employer, outcome);
    streamId = (await outcome.innerText()).match(/#(\d+)/)![1];

    const row = employer.locator("tr").filter({ has: employer.locator("td", { hasText: new RegExp(`^${streamId}$`) }) });
    await expect(row.getByText("private ·")).toBeVisible();
    const vouch = row.getByRole("button", { name: "Vouch for them" });
    if (await vouch.isVisible()) {
      await vouch.click();
      await settle(employer, row.getByText("✓ verified employee"));
    }
  });

  await test.step("employer runs payroll", async () => {
    const payroll = employer.locator("#payroll");
    await payroll.getByRole("button", { name: "Use that" }).click();
    await payroll.getByRole("button", { name: /^Run payroll for/ }).click();
    await settle(employer, payroll.getByText(/✓ All \d+ active USDC streams? (is|are) funded/));
  });

  await test.step("worker finds the private stream and watches it stream", async () => {
    await worker.goto("/worker");
    const show = worker.getByRole("button", { name: "Show private pay" });
    if (await show.isVisible({ timeout: 10_000 }).catch(() => false)) await show.click();
    // Newest stream first
    const card = worker.locator("article").first();
    await expect(card.getByText("Updating live. 0 transactions.")).toBeVisible({ timeout: 90_000 });
    await expect(card.getByText("private", { exact: true })).toBeVisible();
    await worker.waitForTimeout(15_000); // 3,000 a 10-minute "month" streams 5 USDC a second
  });

  await test.step("worker withdraws through the relayer, with no gas", async () => {
    const card = worker.locator("article").first();
    await card.getByRole("button", { name: "Withdraw" }).click();
    await settle(worker, card.getByText(/^Withdrew [\d,.]+ USDC\.$/));
  });

  await test.step("worker issues an income proof", async () => {
    await worker.getByPlaceholder("0x…").last().fill(employerAddress);
    await worker.getByPlaceholder("2500").fill("2500");
    await worker.getByRole("button", { name: "Issue proof" }).click();
    const issued = worker.getByText(/Proof #\d+ issued/);
    await settle(worker, issued);
    proofId = (await issued.innerText()).match(/#(\d+)/)![1];
  });

  await test.step("the proof checks out on /verify", async () => {
    const verifier = await employerCtx.newPage();
    await verifier.goto(`/verify/${proofId}`);
    await expect(verifier.getByText("Yes, it meets the threshold.")).toBeVisible({ timeout: 60_000 });
  });

  console.log(`employer ${employerAddress}, worker ${workerAddress}, stream #${streamId}, proof #${proofId}`);
  await employerCtx.close();
  await workerCtx.close();
});
