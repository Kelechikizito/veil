import Link from "next/link";
import { AuthButton } from "./AuthButton";
import { AgentToggle, SoundToggle } from "./Toggles";
import { Ribbon, Sticker } from "./Stickers";
import { Container } from "./ui";

const MARQUEE = [
  "Payroll by the second",
  "Testnet demo on Monad",
  "Paid to one-time addresses",
  "Withdraw without gas",
  "Income proofs that expire",
];

/** Black strip at the very top: the one place we state the network status. Scrolls on a loop. */
export function Marquee() {
  // Two identical halves so the -50% loop is seamless
  const items = [...MARQUEE, ...MARQUEE];
  return (
    <div className="overflow-hidden bg-carbon text-paper-white" aria-label="Testnet demo on Monad">
      <div aria-hidden className="marquee-track flex w-max">
        {items.map((m, i) => (
          <span key={i} className="label-type flex items-center gap-6 py-2 pr-6 text-caption whitespace-nowrap uppercase">
            {m}
            <span>✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#roles", label: "Who it's for" },
  { href: "/#live", label: "Live" },
  { href: "/audit", label: "Auditors" },
  { href: "/docs", label: "Docs" },
];

/** Logo mark: a round outlined "V" badge */
function LogoMark() {
  return (
    <Link
      href="/"
      aria-label="Veil home"
      data-cuelume-navigate=""
      className="flex h-11 w-11 items-center justify-center rounded-nav border border-carbon bg-paper-white font-lateral text-[22px] leading-none hover:bg-soft-mist"
    >
      V
    </Link>
  );
}

/** Top bar: logo left, pill nav center, auth right. Sits on whatever band is below it. */
export function SiteHeader({ className = "bg-sky-wash" }: { className?: string }) {
  return (
    <>
      <Marquee />
      <header className={className}>
        <Container className="flex h-20 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LogoMark />
            <Link href="/" className="label-type hidden text-[14px] uppercase sm:inline">
              Veil
            </Link>
          </div>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                data-cuelume-navigate=""
                className="label-type rounded-nav border border-carbon bg-paper-white px-3 py-[13px] text-[13px] leading-none uppercase hover:bg-soft-mist"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <AgentToggle />
            <SoundToggle />
            <AuthButton />
          </div>
        </Container>
      </header>
    </>
  );
}

const BUILT_ON = [
  ["https://monad.xyz", "Monad"],
  ["https://privy.io", "Privy"],
  ["https://testnet.monadvision.com", "MonadVision"],
  ["https://getfoundry.sh", "Foundry"],
  ["https://eips.ethereum.org/EIPS/eip-5564", "ERC-5564"],
];

/** Black footer: links, then the wordmark at poster size with a ribbon looping under it */
export function SiteFooter() {
  return (
    <footer className="relative mt-auto overflow-hidden bg-carbon pt-16 text-paper-white">
      <Container className="relative z-10 flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-md flex-col gap-4">
          <p className="text-caption text-paper-white/70">
            Payroll on Monad testnet. A hackathon build: not audited, not financial advice. Don&apos;t use real funds.
          </p>
          <p className="text-caption text-paper-white/70">
            Veil builds on Dayze, our earlier payroll project on Base Sepolia, ported to Monad with stealth payees instead
            of FHE.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
            <span className="text-paper-white/55">Built on</span>
            {BUILT_ON.map(([href, label]) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                {label}
              </a>
            ))}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2">
          {[
            ["/employer", "Employer console"],
            ["/worker", "Worker app"],
            ["/approvals", "Approvals"],
            ["/audit", "Auditor view"],
            ["/docs", "Docs"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              data-cuelume-navigate=""
              className="label-type rounded-nav border border-paper-white px-3 py-2.5 text-caption uppercase hover:bg-paper-white/10"
            >
              {label}
            </Link>
          ))}
          <a
            href="https://docs.monad.xyz"
            data-cuelume-navigate=""
            className="label-type rounded-nav border border-paper-white px-3 py-2.5 text-caption uppercase hover:bg-paper-white/10"
          >
            Monad ↗
          </a>
        </nav>
      </Container>
      <div className="relative mt-12 h-[44vw] max-h-[420px] min-h-[160px]">
        <Ribbon variant="loop" className="opacity-90" />
        <span
          aria-hidden
          className="display-type absolute inset-x-0 bottom-[-0.12em] z-10 text-center text-[38vw] text-paper-white xl:text-display-lg"
        >
          Veil
        </span>
        <Sticker kind="coin" size={96} rotate={-14} className="absolute top-4 left-[8%] z-20" />
        <Sticker kind="lock" size={80} rotate={12} className="absolute top-10 right-[10%] z-20" />
      </div>
    </footer>
  );
}
