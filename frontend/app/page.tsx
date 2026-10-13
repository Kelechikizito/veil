import type { ReactNode } from "react";
import { ChainVsYou } from "@/components/landing/ChainVsYou";
import { HeroPayCard } from "@/components/landing/HeroPayCard";
import { AuditorMock, CredentialMock, EmployerMock } from "@/components/landing/RoleMocks";
import { RoleButtons } from "@/components/RoleButtons";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Ribbon, Sticker, type StickerKind } from "@/components/Stickers";
import { Badge, ButtonLink, Container } from "@/components/ui";

/*
 * Landing. Each section is a full-bleed color band, read top to bottom like posters (DESIGN.md "Layout"):
 * sky hero → electric-blue live pay → gray stats → white ledgers → sky roles → gray privacy → mint steps → white roadmap → black footer.
 * Every display headline is paired with the ribbon or a sticker cluster. Only the marquee and the product mocks move.
 */

const roles: {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  mock: ReactNode;
  panel: string;
  sticker: StickerKind;
}[] = [
  {
    eyebrow: "Employers",
    title: "Run payroll in the open. Keep who earns what to yourself.",
    body: "Fund a vault, set an approval threshold, and stream USDC salaries to one-time addresses.",
    href: "/onboarding/employer",
    cta: "Set up an org",
    mock: <EmployerMock />,
    panel: "bg-voltage-violet",
    sticker: "wallet",
  },
  {
    eyebrow: "Workers",
    title: "Get paid by the second. Stay unlinked.",
    body: "Withdraw to any address without paying gas, and show a landlord “I earn at least X” when you choose.",
    href: "/onboarding/employee",
    cta: "Open your pay",
    mock: <CredentialMock />,
    panel: "bg-ember",
    sticker: "coin",
  },
  {
    eyebrow: "Auditors",
    title: "The full ledger, for the one person who should read it.",
    body: "An employer appoints you and hands you the payee list. You see every salary and who it pays, and export the month as CSV.",
    href: "/audit",
    cta: "Auditor view",
    mock: <AuditorMock />,
    panel: "bg-electric-blue",
    sticker: "eye",
  },
];

const privateItems = ["Which salary is whose", "Who withdraws, and where to", "A worker's wallet and its history"];
const publicItems = [
  "Every amount: salaries, budgets, withdrawals",
  "Which employer pays, and when payroll runs",
  "Which workers an employer vouched for",
  "Income proofs a worker chooses to issue",
];

const steps: { n: string; title: string; body: string; dot: string }[] = [
  { n: "01", title: "Fund", body: "Move USDC into your payroll vault. On testnet, the USDC is minted for you.", dot: "bg-sunburst" },
  { n: "02", title: "Stream", body: "Each salary goes to a fresh one-time address. Pay accrues every second.", dot: "bg-electric-blue" },
  { n: "03", title: "Approve", body: "Salaries above your threshold wait for k of your n approvers.", dot: "bg-lavender" },
  {
    n: "04",
    title: "Withdraw and prove",
    body: "Workers withdraw to any address without gas, and issue income proofs that expire.",
    dot: "bg-ember",
  },
];

const roadmap: { title: string; body: string; sticker: StickerKind }[] = [
  {
    title: "Zero-knowledge income proofs",
    body: "Prove “I earn at least X” without showing which salary is yours or how much it pays.",
    sticker: "lock",
  },
  {
    title: "Invite by email",
    body: "Type an employee's email and Veil sends them your invite link. The address is used once and never stored.",
    sticker: "star",
  },
  {
    title: "Pay notifications",
    body: "An email when your stream starts or is approved. It says your pay started, never how much.",
    sticker: "clock",
  },
];

const stats: { value: string; caption: string; sticker: StickerKind; rotate: number }[] = [
  { value: "0", caption: "gas a worker pays to withdraw. Veil covers it.", sticker: "coin", rotate: -12 },
  { value: "1 tap", caption: "to confirm your employer, with Face ID or your fingerprint", sticker: "key", rotate: 10 },
  { value: "86,400", caption: "times a day your pay moves. It accrues every second.", sticker: "clock", rotate: -6 },
];

/** Section display headlines: Lateral, crushed leading. Full-width ones go bigger than ones in a column. */
const sectionHeading = "display-type text-[38px] sm:text-[52px] md:text-display-70";
const wideHeading = "display-type text-[38px] sm:text-[52px] md:text-display-110";

/** A full-bleed band with the 1440px frame inside */
function Band({ children, className, id }: { children: ReactNode; className: string; id?: string }) {
  return (
    <section id={id} className={`relative overflow-hidden py-20 md:py-28 ${className}`}>
      <Container className="relative z-10">{children}</Container>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <SiteHeader />

      {/* Hero — sky wash, ribbon behind the headline, stickers around it */}
      <section className="relative isolate overflow-hidden bg-sky-wash pt-10 pb-20 md:pt-16 md:pb-28">
        <Ribbon variant="hero" className="-z-10 max-md:!h-[45%]" />
        <Container className="relative flex flex-col items-center gap-10 text-center">
          <h1 className="display-type relative max-w-[14ch] text-[11vw] md:text-display-110 xl:text-display-160">
            Payroll nobody can trace to you
          </h1>
          <Sticker kind="coin" size={112} rotate={-14} className="absolute top-[2%] left-[4%] hidden md:block" />
          <Sticker kind="lock" size={96} rotate={12} className="absolute top-[8%] right-[5%] hidden md:block" />
          <Sticker kind="check" size={88} rotate={-8} className="absolute bottom-[30%] left-[8%] hidden lg:block" />
          <Sticker kind="wallet" size={104} rotate={16} className="absolute right-[7%] bottom-[24%] hidden lg:block" />
          <p className="max-w-2xl text-subheading md:text-heading-sm">
            Salaries stream onchain by the second, to one-time addresses. Everyone can see payroll ran. Only you know
            which salary is yours.
          </p>
          <RoleButtons />
        </Container>
      </section>

      {/* Live pay — electric blue */}
      <Band className="bg-electric-blue">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
          <div className="relative flex flex-col gap-6">
            <Badge ghost>Live · by the second</Badge>
            <h2 className={sectionHeading}>Pay that moves while you watch</h2>
            <p className="max-w-md text-subheading">
              Your salary accrues every second and you can withdraw any of it, any time. Flip the card to see what the
              rest of the world gets: a salary paid to someone they can&apos;t name.
            </p>
            <Sticker kind="clock" size={96} rotate={10} className="absolute -top-10 right-[8%] hidden md:block" />
          </div>
          <HeroPayCard />
        </div>
      </Band>

      {/* Stats — concrete gray */}
      <Band className="bg-concrete-gray">
        <div className="grid gap-12 md:grid-cols-3">
          {stats.map((s) => (
            <div key={s.value} className="relative flex flex-col gap-4">
              <Sticker kind={s.sticker} size={64} rotate={s.rotate} className="absolute -top-8 right-[10%]" />
              <span className="display-type text-display-70 lg:text-display-110">{s.value}</span>
              <span className="max-w-[16rem] text-body-lg">{s.caption}</span>
            </div>
          ))}
        </div>
      </Band>

      {/* Chain vs you — white */}
      <Band className="bg-paper-white">
        <div className="flex flex-col gap-14">
          <div className="relative flex max-w-4xl flex-col gap-6">
            <Badge ghost>Same transactions</Badge>
            <h2 className={wideHeading}>Public amounts. Private people.</h2>
            <Sticker kind="eye" size={88} rotate={-10} className="absolute -top-6 -right-6 hidden md:block" />
            <p className="max-w-xl text-subheading">
              Every payment lands onchain, amount and all. On the explorer it goes to a one-time address. Only
              Alice&apos;s app knows it&apos;s hers.
            </p>
          </div>
          <ChainVsYou />
        </div>
      </Band>

      {/* Roles — sky wash, ribbon arcing across the top */}
      <section id="roles" className="relative isolate overflow-hidden bg-sky-wash py-20 md:py-28">
        <Ribbon variant="arc" className="-z-10 !h-[300px]" />
        <Container className="flex flex-col gap-14">
          <h2 className={`max-w-5xl ${wideHeading}`}>Three people. Three views of one payroll.</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {roles.map((r) => (
              <article
                key={r.eyebrow}
                className="relative flex flex-col gap-6 rounded-cards-elevated border border-carbon bg-paper-white p-4 pb-6"
              >
                <div className={`relative rounded-cards border border-carbon p-5 ${r.panel}`}>
                  {r.mock}
                  <Sticker kind={r.sticker} size={56} rotate={12} className="absolute -top-5 -right-3" />
                </div>
                <div className="flex flex-1 flex-col gap-4 px-2">
                  <Badge ghost>{r.eyebrow}</Badge>
                  <h3 className="text-heading-sm font-bold">{r.title}</h3>
                  <p className="flex-1 text-carbon/70">{r.body}</p>
                  <div>
                    <ButtonLink href={r.href} variant="outline">
                      {r.cta}
                    </ButtonLink>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* Privacy — concrete gray */}
      <Band className="bg-concrete-gray" id="private">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.4fr]">
          <div className="relative flex flex-col gap-6">
            <Badge ghost>What&apos;s private</Badge>
            <h2 className={sectionHeading}>Honest about the edges</h2>
            <p className="text-subheading">
              A chain shows that money moved, and how much. Veil hides who it moved to, and says exactly what it
              doesn&apos;t hide.
            </p>
            <div aria-hidden className="relative h-24">
              <Sticker kind="lock" size={84} rotate={-10} className="absolute left-0" />
              <Sticker kind="star" size={64} rotate={14} className="absolute top-6 left-20" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: "Hidden", items: privateItems, fill: "bg-lavender" },
              { label: "Public", items: publicItems, fill: "bg-paper-white" },
            ].map((col) => (
              <div key={col.label} className={`flex flex-col gap-4 rounded-cards-elevated border border-carbon p-6 ${col.fill}`}>
                <span className="label-type text-caption uppercase">{col.label}</span>
                <ul className="flex flex-col">
                  {col.items.map((item) => (
                    <li key={item} className="border-t border-carbon py-3 text-body-lg font-bold">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Band>

      {/* How it works — mint band */}
      <Band className="bg-mint-pop" id="how">
        <div className="flex flex-col gap-14">
          <div className="flex items-end gap-6">
            <h2 className={wideHeading}>How it works</h2>
            <Sticker kind="check" size={80} rotate={-12} className="mb-2 hidden sm:block" />
          </div>
          <ol className="grid gap-4 md:grid-cols-4">
            {steps.map((s) => (
              <li key={s.n} className="flex flex-col gap-4 rounded-cards border border-carbon bg-paper-white p-6">
                <span
                  className={`label-type flex h-12 w-12 items-center justify-center rounded-nav border border-carbon text-[14px] ${s.dot}`}
                >
                  {s.n}
                </span>
                <h3 className="text-subheading font-bold">{s.title}</h3>
                <p className="text-carbon/70">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Band>

      {/* Roadmap — white */}
      <Band className="bg-paper-white" id="roadmap">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.4fr]">
          <div className="relative flex flex-col gap-6">
            <Badge ghost>Roadmap</Badge>
            <h2 className={sectionHeading}>Coming next</h2>
            <p className="text-subheading">What we&apos;re building after the hackathon.</p>
          </div>
          <ul className="flex flex-col gap-4">
            {roadmap.map((r) => (
              <li key={r.title} className="flex items-start gap-5 rounded-cards border border-carbon bg-sky-wash p-6">
                <Sticker kind={r.sticker} size={48} rotate={-8} />
                <div className="flex flex-col gap-2">
                  <h3 className="text-subheading font-bold">{r.title}</h3>
                  <p className="text-carbon/70">{r.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Band>

      <SiteFooter />
    </>
  );
}
