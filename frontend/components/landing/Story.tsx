import { RoleButtons } from "@/components/RoleButtons";
import { Sticker, type StickerKind } from "@/components/Stickers";
import { Badge, ButtonLink } from "@/components/ui";
import { CONTRACTS, contractAddress } from "@/lib/agentDocs";
import { defaultChain } from "@/lib/chains";

/*
 * Landing sections that tell Veil's story to a judge in order: the problem, the lifecycle,
 * what the sponsors make possible, the contracts, and a closing call to action.
 * Static and server-rendered; the live section is LiveOnMonad.
 */

const heading = "display-type text-[38px] sm:text-[52px] md:text-display-70";
const wide = "display-type text-[38px] sm:text-[52px] md:text-display-110";

/* -------------------------------------------------------------------------- */
/*                              THE THREE LEAKS                               */
/* -------------------------------------------------------------------------- */

const leaks: { failure: string; why: string; fix: string; how: string; sticker: StickerKind; fill: string }[] = [
  {
    failure: "Your salary lands in your wallet",
    why: "On a public chain, anyone who learns your address sees your pay, your savings and everything you buy.",
    fix: "Each salary goes to a one-time address",
    how: "Veil uses stealth addresses (ERC-5564), so only your app can tell the address is yours. A relayer pays the gas when you withdraw, so funding the address can't link it back to you.",
    sticker: "eye",
    fill: "bg-lavender",
  },
  {
    failure: "Anyone can claim a job",
    why: "A wallet address doesn't say who employs its owner, so a payment alone proves nothing about the job.",
    fix: "Employment that both sides confirm",
    how: "The employer vouches for the worker, and the worker confirms with a passkey that Monad's P256 precompile checks onchain.",
    sticker: "key",
    fill: "bg-mint-pop",
  },
  {
    failure: "Proving income means a payslip",
    why: "Landlords ask for bank statements, which show your exact pay, your employer and much more.",
    fix: "A yes-or-no proof that expires",
    how: "The proof answers “earns at least X” from your live salary, for one verifier, until a date you pick. You can revoke it.",
    sticker: "lock",
    fill: "bg-sky-wash",
  },
];

export function Leaks() {
  return (
    <section className="relative overflow-hidden bg-paper-white py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-14 px-4 md:px-10">
        <div className="flex max-w-4xl flex-col gap-6">
          <Badge ghost>The problem</Badge>
          <h2 className={wide}>Onchain payroll leaks in three places</h2>
          <p className="max-w-xl text-subheading">A public ledger keeps good books, but it also exposes the people being paid.</p>
        </div>
        <ul className="grid gap-4 lg:grid-cols-3">
          {leaks.map((l) => (
            <li key={l.failure} className="relative flex flex-col overflow-hidden rounded-cards-elevated border border-carbon">
              <div className="flex flex-col gap-3 bg-paper-white p-6">
                <span className="label-type w-fit rounded-pills border border-carbon bg-soft-mist px-3 py-1 text-caption uppercase">
                  The usual failure
                </span>
                <h3 className="text-subheading font-bold">{l.failure}</h3>
                <p className="text-carbon/70">{l.why}</p>
              </div>
              <div className={`flex flex-1 flex-col gap-3 border-t border-carbon p-6 ${l.fill}`}>
                <Sticker kind={l.sticker} size={56} rotate={-10} className="absolute top-1/2 right-5 -translate-y-1/2" />
                <span className="label-type w-fit rounded-pills border border-carbon bg-carbon px-3 py-1 text-caption text-paper-white uppercase">
                  Veil
                </span>
                <h3 className="pr-16 text-subheading font-bold">{l.fix}</h3>
                <p>{l.how}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                            ONE SALARY, THREE STATES                        */
/* -------------------------------------------------------------------------- */

const states: { name: string; when: string; body: string; worker: string; fill: string; sticker: StickerKind }[] = [
  {
    name: "Needs approval",
    when: "Above the employer's limit",
    body: "The salary waits for k of the employer's n approvers and doesn't stream until they approve. Salaries under the limit skip this step.",
    worker: "Worker sees: waiting for approvers",
    fill: "bg-lavender",
    sticker: "clock",
  },
  {
    name: "Active",
    when: "Approved, or below the limit",
    body: "Each period the employer runs payroll with a budget. Pay accrues every second, and the worker can withdraw what they've earned at any time.",
    worker: "Worker sees: pay ticking up, withdraw and prove",
    fill: "bg-paper-white",
    sticker: "coin",
  },
  {
    name: "Cancelled",
    when: "The employer stops it",
    body: "Streaming stops, but the worker keeps what they already earned and can still withdraw it. Their income proofs stop being valid.",
    worker: "Worker sees: final balance to withdraw",
    fill: "bg-soft-mist",
    sticker: "check",
  },
];

export function SalaryStates() {
  return (
    <section className="relative overflow-hidden bg-lavender py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-14 px-4 md:px-10">
        <div className="flex max-w-4xl flex-col gap-6">
          <Badge ghost>The lifecycle</Badge>
          <h2 className={heading}>One salary, three states</h2>
          <p className="max-w-xl text-subheading">The contract enforces each state, so pay keeps streaming without anyone online to run it.</p>
        </div>
        <ol className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {states.map((s, i) => (
            <li key={s.name} className="contents">
              <div className={`relative flex flex-col gap-4 rounded-cards-elevated border border-carbon p-6 ${s.fill}`}>
                <Sticker kind={s.sticker} size={52} rotate={i % 2 ? 10 : -10} className="absolute -top-5 right-6" />
                <span className="label-type w-fit rounded-pills border border-carbon bg-paper-white px-3 py-1 text-caption uppercase">
                  {String(i + 1).padStart(2, "0")} · {s.when}
                </span>
                <h3 className="text-heading-sm font-bold">{s.name}</h3>
                <p className="flex-1 text-carbon/70">{s.body}</p>
                <p className="border-t border-carbon pt-3 font-mono text-caption">{s.worker}</p>
              </div>
              {i < states.length - 1 && (
                <span
                  aria-hidden
                  className="flex h-12 w-12 items-center justify-center self-center justify-self-center rounded-nav border border-carbon bg-paper-white text-subheading font-bold max-lg:rotate-90"
                >
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 BUILT ON                                   */
/* -------------------------------------------------------------------------- */

const pillars: { name: string; line: string; points: string[]; fill: string; sticker: StickerKind }[] = [
  {
    name: "Monad",
    line: "Fast, cheap blocks make per-second pay practical.",
    points: [
      "Blocks every 300 ms and finality in 600 ms, so a withdrawal lands almost as soon as you press the button.",
      "The P256 precompile (EIP-7951) checks passkeys onchain, so a worker confirms their employer with Face ID.",
      "Low fees let a worker withdraw whenever they like and issue a proof for each landlord.",
    ],
    fill: "bg-electric-blue",
    sticker: "star",
  },
  {
    name: "Privy",
    line: "People who have never used crypto can get paid with just an email address.",
    points: [
      "Sign in with Google or email, and Privy creates a wallet for you.",
      "Privy sponsors the gas, so workers never need to hold MON.",
      "An employer can run several organisations from one login, each in its own wallet.",
    ],
    fill: "bg-sunburst",
    sticker: "wallet",
  },
];

export function BuiltOn() {
  return (
    <section className="relative overflow-hidden bg-paper-white py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-14 px-4 md:px-10">
        <div className="flex max-w-4xl flex-col gap-6">
          <Badge ghost>Built on</Badge>
          <h2 className={heading}>What Monad and Privy make possible</h2>
          <p className="max-w-xl text-subheading">Veil depends on both to work for people who have never used crypto.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {pillars.map((p) => (
            <article key={p.name} className="relative flex flex-col overflow-hidden rounded-cards-elevated border border-carbon bg-paper-white">
              <header className={`relative flex flex-col gap-2 border-b border-carbon p-6 ${p.fill}`}>
                <Sticker kind={p.sticker} size={60} rotate={12} className="absolute top-4 right-5" />
                <h3 className="display-type text-display-70">{p.name}</h3>
                <p className="pr-16 text-body-lg font-bold">{p.line}</p>
              </header>
              <ul className="flex flex-col gap-3 p-6">
                {p.points.map((pt) => (
                  <li key={pt} className="flex gap-3">
                    <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full border border-carbon bg-carbon" />
                    {pt}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 CONTRACTS                                  */
/* -------------------------------------------------------------------------- */

const explorer = defaultChain.blockExplorers.default;

export function ContractsGrid() {
  const deployed = CONTRACTS.filter(([key]) => contractAddress(key)).length;
  return (
    <section id="contracts" className="relative overflow-hidden bg-concrete-gray py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-14 px-4 md:px-10">
        <div className="flex max-w-4xl flex-col gap-6">
          <Badge ghost>Under the hood</Badge>
          <h2 className={heading}>
            {CONTRACTS.length} contracts on {defaultChain.name}
          </h2>
          <p className="max-w-xl text-subheading">
            {deployed === CONTRACTS.length
              ? "All of them are live. Open any one on the explorer."
              : deployed === 0
                ? "Deploying soon. Addresses appear here as soon as they're live."
                : `${deployed} of ${CONTRACTS.length} are live.`}
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CONTRACTS.map(([key, name, what]) => {
            const address = contractAddress(key);
            return (
              <li key={key} className="flex flex-col gap-3 rounded-cards border border-carbon bg-paper-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-mono text-body-lg font-bold break-all">{name}</h3>
                  <span
                    className={`label-type shrink-0 rounded-pills border border-carbon px-2.5 py-0.5 text-caption uppercase ${
                      address ? "bg-carbon text-paper-white" : "bg-soft-mist"
                    }`}
                  >
                    {address ? "Live" : "Soon"}
                  </span>
                </div>
                <p className="flex-1 text-caption text-carbon/70">{what}</p>
                {address ? (
                  <a
                    href={`${explorer.url}/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-caption underline underline-offset-4"
                  >
                    {address.slice(0, 6)}…{address.slice(-4)} ↗
                  </a>
                ) : (
                  <span className="font-mono text-caption text-carbon/55">not deployed yet</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                               CLOSING CTA                                  */
/* -------------------------------------------------------------------------- */

export function ClosingCta() {
  return (
    <section className="relative isolate overflow-hidden bg-electric-blue py-24 md:py-32">
      <Sticker kind="coin" size={96} rotate={-14} className="absolute top-10 left-[6%] hidden md:block" />
      <Sticker kind="check" size={80} rotate={12} className="absolute right-[8%] bottom-12 hidden md:block" />
      <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-8 px-4 text-center md:px-10">
        <h2 className="display-type max-w-[16ch] text-[40px] sm:text-[56px] md:text-display-110">
          Set it up once, and pay streams every second
        </h2>
        <p className="label-type rounded-pills border border-carbon bg-paper-white px-4 py-2 text-caption uppercase">
          Setup takes about five minutes.
        </p>
        <RoleButtons />
        <ButtonLink href="/verify" variant="outline">
          Check an income proof
        </ButtonLink>
      </div>
    </section>
  );
}
