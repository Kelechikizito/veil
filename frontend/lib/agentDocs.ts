import { defaultChain } from "./chains";
import { addresses } from "./contracts/addresses";

/*
 * Veil's docs, written once as Markdown. The /docs pages render it, "Copy for agents" copies it,
 * and /llms.txt and /llms/<slug>.md serve it to agents that only have a URL.
 * Addresses come from the generated deployment, so the docs follow every redeploy.
 */

export type DocPage = { slug: string; title: string; summary: string; markdown: string };

type Deployment = Partial<Record<string, string | number>>;

const chain = defaultChain;
const d = (addresses as Record<string, Deployment | undefined>)[String(chain.id)];
const explorer = chain.blockExplorers.default.url;
const rpc = chain.rpcUrls.default.http[0];

/** A contract's deployed address, or undefined before deploy */
export const contractAddress = (key: string): string | undefined => (typeof d?.[key] === "string" ? (d[key] as string) : undefined);

/** An address cell for the docs, or a note before deploy */
const addr = (key: string) => (typeof d?.[key] === "string" ? `\`${d[key]}\`` : "not deployed yet");

/** Veil's contracts: deployment key, name, one line on what it holds */
export const CONTRACTS: [key: string, name: string, what: string][] = [
  ["payroll", "VeilPayroll", "Orgs, vaults, salary streams, payroll runs and withdrawals"],
  ["approvalPolicy", "ApprovalPolicy", "k-of-n approvers and the salary limit above which they must approve"],
  ["auditRegistry", "AuditRegistry", "Who may audit an employer's books"],
  ["employeeRegistry", "EmployeeRegistry", "Employer vouches and worker passkey confirms"],
  ["incomeCredential", "IncomeCredential", "Expiring \"earns at least X\" proofs for one verifier"],
  ["joinRequests", "JoinRequests", "Workers asking an employer to add them"],
  ["stealthRegistry", "StealthRegistry", "Workers' stealth meta-addresses (ERC-5564)"],
  ["usdc", "DemoToken (USDC)", "Testnet USDC with 6 decimals. Anyone can mint it"],
];

function overview(base: string): string {
  return `# Veil

Veil is payroll on Monad. Employers stream salaries by the second from a vault. Workers are paid at one-time addresses, so nobody can link a salary to a person. Workers can show an expiring "earns at least X" proof to one verifier.

This is a testnet demo. It is not audited. Don't use real funds.

## Who uses it

- **Employer**: creates an org, funds a vault in USDC, creates salary streams, and runs payroll each period with a budget.
- **Worker**: signs in with Google or email, confirms their employer with a passkey, withdraws pay without gas, and issues income proofs.
- **Approver**: approves salaries above the employer's limit. An employer names n approvers and needs k of them.
- **Auditor**: an employer appoints them. They read every salary, and the employer gives them the list of who each one pays.
- **Verifier**: a landlord or lender. They receive a proof link and check it. No account needed.

## What is public and what is hidden

- Public: every amount, which employer pays, when payroll runs, which workers an employer vouched for, and proofs a worker issues.
- Hidden: which salary is whose, who withdraws and where to, and a worker's main wallet.

## Network

| | |
|---|---|
| Chain | ${chain.name} |
| Chain id | ${chain.id} |
| Public RPC | ${rpc} |
| Explorer | ${explorer} |

## More

- [Agents](${base}/docs/agents): what an AI agent can do for each person, and the safety rules.
- [Contracts](${base}/docs/contracts): addresses and functions.
- [HTTP API](${base}/docs/api): read endpoints and the sign-a-proposal link.
`;
}

function agents(base: string): string {
  return `# Veil for agents

Agents are optional. Veil works fully without them. In the app, turn on **Agent mode** (the robot button in the header) to see "Copy for agents" buttons and ready-made agent briefs.

## The rules

1. **Never hold a person's keys.** An agent never gets a wallet key, a passkey, or a stealth key.
2. **Propose, don't sign.** To change anything onchain, an agent sends the person a link to ${base}/sign. The person reads what it does, then signs it themselves.
3. **Keep the payee list private.** Only an auditor's agent may see the employer's payee list. It is the one thing that links one-time addresses to names.
4. **Reading is free.** Everything onchain is public. Agents may read it through the [HTTP API](${base}/docs/api) or the [contracts](${base}/docs/contracts).

## What an agent can do

| Person | The agent can | How |
|---|---|---|
| Employer | Check the vault covers next period. Draft the payroll run. Remind before the period ends | GET /api/org/{employer}, then a /sign link for \`fundVault\` or \`runPayroll\` |
| Approver | Check a pending salary against an HR list or offer letter, then propose the approval | Read \`getStream\`, then a /sign link for \`approve\` |
| Auditor | Reconcile the month, flag salaries that changed or look odd, summarise for the employer | GET /api/org/{employer}, \`streamsOfPayer\`, \`getStream\`, plus the payee list |
| Verifier | Check an income proof in one request | GET /api/credential/{id} |
| Worker | Explain a proof request and draft the proof's settings | Read only. The worker issues the proof in the app |

## What agents should not do

- Withdraw a worker's pay. It needs the worker's one-time-address key, and holding that key would also link the pay to them.
- Create, cancel or defund streams on their own. These move money. Propose them with /sign, and only when the person asked.

## Coming next

- An **operator role**: a wallet that may run payroll and fund the vault, and nothing else. Then a scheduled agent can run payroll without holding the employer's key.
- **Scheduled payroll** as a Chainlink CRE workflow, using the operator role.
- **Policy wallets**: Privy server wallets limited to Veil's contracts and a spending cap.
- A read-only **MCP server** with tools like \`vault_runway\` and \`check_credential\`.
`;
}

function contracts(): string {
  const rows = CONTRACTS.map(([key, name, what]) => `| ${name} | ${addr(key)} | ${what} |`).join("\n");
  return `# Contracts

All contracts are on ${chain.name} (chain id ${chain.id}).

| Contract | Address | What it holds |
|---|---|---|
${rows}

## Units

- Amounts are token units. USDC has 6 decimals: 1 USDC = \`1000000\`.
- Salaries are monthly amounts. A pay period is ${typeof d?.period === "number" ? `${d.period} seconds` : "set at deploy"}.
- Stream status: \`0\` None, \`1\` Pending (waiting for approvals), \`2\` Active, \`3\` Cancelled.

## VeilPayroll: read

| Function | Returns |
|---|---|
| \`orgOf(address payer)\` | The org: \`(string name, bool exists)\` |
| \`vaultOf(address payer, address token)\` | Unallocated money in the employer's vault |
| \`streamsOfPayer(address payer)\` | Ids of every stream the employer created |
| \`getStream(uint256 id)\` | payer, payee, token, monthly, withdrawn, allocated, banked, times, status |
| \`available(uint256 id)\` | What has streamed and not yet been withdrawn |
| \`periodEnd(uint64 timestamp)\` | When the pay period containing \`timestamp\` ends |

## VeilPayroll: write (employer)

| Function | Does |
|---|---|
| \`fundVault(address token, uint256 amount)\` | Moves USDC from the employer into their vault. Approve the token first |
| \`runPayroll(address token, uint256 budget, uint256[] ids)\` | Sets aside this period's pay. The budget is shared across \`ids\` in order |
| \`createStealthStream(...)\` | Starts a salary to a worker's one-time address. The app builds this call |
| \`cancelStream(uint256 id)\` | Stops a salary. What it earned stays the worker's |
| \`defundVault(address token, uint256 amount)\` | Moves unallocated money back to the employer |

## ApprovalPolicy

| Function | Does |
|---|---|
| \`approversOf(address payer)\`, \`required(address payer)\` | The n approvers and the k needed |
| \`thresholdOf(address payer, address token)\` | Monthly salaries above this need approval |
| \`approvalCount(address payer, uint256 streamId)\` | Approvals so far |
| \`approve(address payer, uint256 streamId)\` | An approver says yes |

## AuditRegistry

| Function | Does |
|---|---|
| \`auditorsOf(address payer)\`, \`isAuditor(address payer, address who)\` | Who audits an employer |
| \`addAuditor(address auditor)\`, \`removeAuditor(address auditor)\` | The employer appoints or removes one |

## IncomeCredential

| Function | Does |
|---|---|
| \`get(uint256 id)\` | payee, payer, verifier, token, streamId, threshold, issuedAt, expiresAt, revoked, employeeVerified, ok |
| \`isValid(uint256 id)\` | True while it isn't revoked, hasn't expired, and the salary is still active |
| \`credentialsFor(address verifier)\` | Proofs issued to a verifier |

\`ok\` is the answer to "earns at least threshold a month", checked when the proof was issued.

## Examples with cast

\`\`\`bash
# An employer's vault, in USDC units
cast call ${d?.payroll ?? "<VeilPayroll>"} "vaultOf(address,address)(uint256)" <employer> ${d?.usdc ?? "<USDC>"} --rpc-url ${rpc}

# Is credential 7 valid?
cast call ${d?.incomeCredential ?? "<IncomeCredential>"} "isValid(uint256)(bool)" 7 --rpc-url ${rpc}

# Calldata for a payroll run, to put in a /sign link
cast calldata "runPayroll(address,uint256,uint256[])" ${d?.usdc ?? "<USDC>"} 5000000000 "[1,2,3]"
\`\`\`

ABIs are in the repo under \`frontend/lib/contracts/abis\`.
`;
}

function api(base: string): string {
  return `# HTTP API

Read-only JSON endpoints. They read the chain directly, so they return what anyone could read onchain. No key needed.

## GET /api/credential/{id}

Checks an income proof.

\`\`\`bash
curl ${base}/api/credential/7
\`\`\`

\`\`\`json
{
  "id": "7",
  "valid": true,
  "answer": true,
  "question": "Earns at least 2500 USDC a month?",
  "threshold": "2500",
  "unit": "USDC",
  "employer": { "address": "0x…", "name": "Acme Labs" },
  "employeeVerified": true,
  "verifier": "0x…",
  "issuedAt": "2026-10-13T10:00:00.000Z",
  "expiresAt": "2026-10-27T10:00:00.000Z",
  "revoked": false,
  "link": "${base}/verify/7"
}
\`\`\`

\`valid\` is the onchain \`isValid\`. Trust \`answer\` only when \`valid\` is true.

## GET /api/org/{employer}

An employer's payroll at a glance: vault, salaries, and how many periods the vault covers.

\`\`\`bash
curl ${base}/api/org/0xEmployer
\`\`\`

\`\`\`json
{
  "employer": "0x…",
  "name": "Acme Labs",
  "token": "USDC",
  "vault": "18000",
  "monthlyActive": "12000",
  "periodsCovered": 1.5,
  "neededThisPeriod": "3000",
  "streams": { "active": 4, "pending": 1, "cancelled": 0 },
  "activeIds": ["3", "4", "9", "12"],
  "unfundedIds": ["12"],
  "pendingIds": ["14"],
  "periodEndsAt": "2026-10-31T00:00:00.000Z"
}
\`\`\`

- \`monthlyActive\` is the sum of active salaries. \`periodsCovered\` is the vault divided by it.
- \`neededThisPeriod\` is what \`runPayroll\` still needs this period, for the salaries in \`unfundedIds\`.
- It never says who a salary pays.

## Errors

Errors return JSON with a stable \`error\` code and a plain \`message\`:

| Code | HTTP | Meaning |
|---|---|---|
| \`not_deployed\` | 503 | Veil isn't deployed on this network yet |
| \`bad_request\` | 400 | The id or address isn't valid |
| \`not_found\` | 404 | No credential or org with that id or address |
| \`rpc_error\` | 502 | The chain didn't answer. Try again |

## Propose a transaction: /sign

An agent never signs. It builds the call and sends the person a link:

\`\`\`
${base}/sign?to=<contract>&data=<calldata>&note=<why, in one sentence>
\`\`\`

The page decodes the call, shows what it does in plain words, and the person signs it with their own wallet. It only accepts calls to Veil's contracts. The note is shown as the agent's, unverified.

## For agents

- [${base}/llms.txt](${base}/llms.txt): the index.
- [${base}/llms-full.txt](${base}/llms-full.txt): every page in one file.
- Each page as Markdown: ${base}/llms/overview.md, agents.md, contracts.md, api.md.
`;
}

/** Every docs page, with links made absolute against `base` (e.g. https://veil.example) */
export function docPages(base = ""): DocPage[] {
  return [
    { slug: "overview", title: "Overview", summary: "What Veil is, who uses it, and what stays private.", markdown: overview(base) },
    { slug: "agents", title: "Agents", summary: "What an AI agent can do for each person, and the rules it follows.", markdown: agents(base) },
    { slug: "contracts", title: "Contracts", summary: "Addresses, functions and units, with cast examples.", markdown: contracts() },
    { slug: "api", title: "HTTP API", summary: "Read endpoints for agents, and the propose-then-sign link.", markdown: api(base) },
  ];
}

/** /llms.txt: the index agents read first (llmstxt.org format) */
export function llmsIndex(base: string): string {
  const pages = docPages(base)
    .map((p) => `- [${p.title}](${base}/llms/${p.slug}.md): ${p.summary}`)
    .join("\n");
  return `# Veil

> Payroll on Monad testnet. Salaries stream by the second to one-time addresses; workers prove "earns at least X" to one verifier with an expiring credential. Agents may read everything and propose transactions via ${base}/sign; people sign.

## Docs

${pages}

## Optional

- [Everything in one file](${base}/llms-full.txt)
`;
}

/** A Markdown response any origin may read, for the /llms routes */
export function markdownResponse(body: string) {
  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}
