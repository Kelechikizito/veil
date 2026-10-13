"use client";

import { useAccount } from "wagmi";
import { AgentBriefs, type Brief } from "./AgentTools";

/*
 * Agent briefs for each person, filled in with their address and this site's URL.
 * Every brief follows the rules in /docs/agents: read freely, propose with /sign, never take keys.
 * Rendered only in agent mode (AgentBriefs returns null otherwise).
 */

const site = () => window.location.origin;

/** The shared preamble: where the docs are and the rules */
const rules = (who: string) =>
  `You are helping ${who} with Veil, a payroll app on Monad testnet. First read ${site()}/llms.txt and ${site()}/llms/agents.md.
Rules: never ask for or accept a private key, seed phrase, passkey or stealth key. Never sign or send a transaction. When something should change onchain, give me a ${site()}/sign link (see ${site()}/llms/api.md) with a one-sentence note, and I will review and sign it myself.`;

export function EmployerBriefs() {
  const { address } = useAccount();
  const me = address ?? "<your employer address>";
  const briefs: Brief[] = [
    {
      title: "Payroll check-in",
      body: "Checks your vault covers this period, and drafts the top-up or payroll run for you to sign.",
      prompt: `${rules(`the employer ${me}`)}

Task: every few days, GET ${site()}/api/org/${me}.
- If periodsCovered is below 1.2, tell me how much USDC to add. Give me two /sign links: USDC approve for VeilPayroll, then fundVault.
- If unfundedIds isn't empty and periodEndsAt is less than 3 days away, remind me to run payroll. Give me a /sign link for runPayroll with budget neededThisPeriod (in USDC units, 6 decimals) and ids unfundedIds.
- Report in three short lines: vault, salaries, what I should do.`,
    },
    {
      title: "Approvals watcher",
      body: "Tells you which salaries are waiting for approvers, and who hasn't approved yet.",
      prompt: `${rules(`the employer ${me}`)}

Task: GET ${site()}/api/org/${me} and look at pendingIds. For each, read ApprovalPolicy approvalCount(${me}, id), required(${me}) and hasApproved for each of approversOf(${me}). List which salaries wait and which approvers still need to act. Don't contact anyone; just tell me.`,
    },
  ];
  return <AgentBriefs heading="Let an agent watch your payroll" briefs={briefs} />;
}

export function ApproverBriefs() {
  const { address } = useAccount();
  const me = address ?? "<your approver address>";
  const briefs: Brief[] = [
    {
      title: "Check before you approve",
      body: "Compares each salary waiting for you against a list you give it, then drafts the approval.",
      prompt: `${rules(`the approver ${me}`)}

Task: I will paste a list of the salaries I expect (person or role, monthly USDC). For each employer I approve for, find streams with status 1 (Pending) and read getStream(id). Match each against my list by amount and employer. For a match, give me a /sign link for ApprovalPolicy approve(payer, id). For anything that doesn't match, don't draft anything; explain why.`,
    },
  ];
  return <AgentBriefs heading="Let an agent pre-check approvals" briefs={briefs} />;
}

export function AuditorBriefs() {
  const { address } = useAccount();
  const me = address ?? "<your auditor address>";
  const briefs: Brief[] = [
    {
      title: "Monthly reconcile",
      body: "Reconciles the month from the CSV you export here, and flags anything that changed.",
      prompt: `${rules(`the auditor ${me}`)}

Task: I will paste the month's CSV from Veil's Auditor view. It names who each one-time address pays: keep it private, never repeat names outside this chat. Check that every payment matches its salary, list new, changed and cancelled salaries since last month, and flag anything paid above its salary or to an address not in the CSV. You may cross-check amounts with GET ${site()}/api/org/<employer>. Answer as a short table, then up to five findings.`,
    },
  ];
  return <AgentBriefs heading="Let an agent help with the audit" briefs={briefs} />;
}

export function WorkerBriefs() {
  const briefs: Brief[] = [
    {
      title: "Answer a proof request",
      body: "Helps you choose the smallest proof that answers a landlord or lender, and how long it should last.",
      prompt: `${rules("a worker paid through Veil")}

Task: someone asked me to prove my income. I will paste what they asked. Tell me the lowest monthly threshold that answers their question, and the shortest expiry they need. I issue the proof myself in the Veil app. Don't ask me for my addresses, keys or salary.`,
    },
  ];
  return <AgentBriefs heading="Let an agent help with proofs" briefs={briefs} />;
}

export function VerifierBriefs({ id }: { id?: string }) {
  const credential = id ?? "<credential number>";
  const briefs: Brief[] = [
    {
      title: "Check an income proof",
      body: "Checks a proof link in one request and answers in plain words.",
      prompt: `${rules("a landlord or lender checking an income proof")}

Task: GET ${site()}/api/credential/${credential}. If valid is false, say the proof doesn't count and why (expired, revoked, or the salary stopped). If valid is true, answer the question with yes or no from "answer", say who the employer is, whether the employee is verified, and when the proof expires.`,
    },
  ];
  return <AgentBriefs heading="Check this with an agent" briefs={briefs} />;
}
