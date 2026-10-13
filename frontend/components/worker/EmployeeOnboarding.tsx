"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { isAddress, type Address } from "viem";
import { OnboardingWizard, StepIcon, type WizardStep } from "@/components/OnboardingWizard";
import { ConfirmEmployer, useEmployment } from "@/components/Employment";
import { useStealthKeys, useStealthSetup } from "@/hooks/useStealth";
import type { StepStatus } from "@/components/Stepper";
import { Button } from "@/components/ui";
import { useVeil } from "@/hooks/useVeil";
import { markOnboarded } from "@/lib/routing";
import { useOrgName } from "./hooks";
import { PrivatePaySetup, useMyStreams } from "./PrivatePay";
import { RequestPay, useHasRequested } from "./RequestPay";

const localFlag = (account: string, name: string) => `veil:employee:${account.toLowerCase()}:${name}`;

function readFlag(account: string | undefined, name: string) {
  if (!account) return false;
  try {
    return localStorage.getItem(localFlag(account, name)) === "1";
  } catch {
    return false;
  }
}

function writeFlag(account: string | undefined, name: string) {
  if (!account) return;
  try {
    localStorage.setItem(localFlag(account, name), "1");
  } catch {}
}

/**
 * Employee onboarding (11 §0), opened from the employer's invite link.
 * Chain reads decide each step; only the "address shared" step is a local UX hint.
 */
export function EmployeeOnboarding({ org }: { org?: string }) {
  const router = useRouter();
  const { account } = useVeil();
  const orgAddress = org && isAddress(org) ? (org as Address) : undefined;
  const orgName = useOrgName(orgAddress);
  const employment = useEmployment(account, orgAddress);
  const requested = useHasRequested(orgAddress);
  const { count } = useMyStreams(10_000);
  const { keys } = useStealthKeys();
  const privatePay = useStealthSetup(keys);
  const [shared, setShared] = useState(() => readFlag(account, "shared-address"));

  // A stream exists: onboarding is over
  useEffect(() => {
    if (count > 0) {
      markOnboarded("employee");
      router.push("/worker");
    }
  }, [count, router]);

  const done = { confirm: employment.confirmed, private: privatePay.upToDate, address: requested || shared };
  // Confirming needs the employer's address, so it's a step only when the invite link names them
  const order = orgAddress ? (["confirm", "private", "address", "wait"] as const) : (["private", "address", "wait"] as const);
  const activeKey = order.find((k) => (k === "wait" ? true : !done[k]));
  const statusOf = (k: "confirm" | "private" | "address" | "wait"): StepStatus =>
    k !== "wait" && done[k] ? "done" : k === activeKey ? "active" : "todo";

  const steps: WizardStep[] = [
    {
      key: "signin",
      title: "Sign in",
      help: orgName ? `${orgName} invited you to get paid with Veil.` : "You're signed in. Your wallet was created for you.",
      icon: <StepIcon name="key" />,
      status: "done",
    },
    ...(orgAddress
      ? [
          {
            key: "confirm",
            title: orgName ? `Confirm you work for ${orgName}` : "Confirm your employer",
            help: "One tap with a passkey. Once your employer vouches for you too, landlords see you're a verified employee.",
            bullets: ["Face ID, your fingerprint or your PIN", "Your passkey stays on your device", "Lose your phone and your confirmations stay"],
            icon: <StepIcon name="human" />,
            status: statusOf("confirm"),
            content: <ConfirmEmployer employer={orgAddress} employerName={orgName} />,
          },
        ]
      : []),
    {
      key: "private",
      title: "Turn on private pay",
      help: "Your employer pays you at a fresh one-time address. Amounts are onchain, but nobody else can tell which salary is yours.",
      bullets: ["One signature and one tap", "No gas to pay", "Log in again anywhere and your pay is still found"],
      icon: <StepIcon name="eye" />,
      status: statusOf("private"),
      content: <PrivatePaySetup />,
    },
    {
      key: "address",
      title: orgName ? `Ask ${orgName} to pay you` : "Ask your employer to pay you",
      help: "One tap puts you in your employer's console. They set your salary there. No addresses to copy.",
      bullets: ["Your employer sees your wallet and whether you confirmed", "They set your salary from their console"],
      icon: <StepIcon name="wallet" />,
      status: statusOf("address"),
      content: account && (
        <div className="flex flex-col gap-6">
          <RequestPay employer={orgAddress} employerName={orgName} />
          <details className="group">
            <summary className="cursor-pointer text-caption text-soft-charcoal underline underline-offset-4">
              Other ways: a pay-me link or your address
            </summary>
            <div className="pt-4">
              <AddressShare
                address={account}
                onShared={() => {
                  writeFlag(account, "shared-address");
                  setShared(true);
                }}
              />
            </div>
          </details>
        </div>
      ),
    },
    {
      key: "wait",
      title: "Wait for your first stream",
      help: "As soon as your employer starts your salary, this page moves on by itself.",
      bullets: ["Checking every 10 seconds", "Your pay starts accruing the moment it's active"],
      icon: <StepIcon name="vault" />,
      status: count > 0 ? "done" : statusOf("wait"),
      content: (
        <p className="flex items-center gap-3 text-caption">
          <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-gloss-black" />
          Waiting for {orgName ?? "your employer"}…
        </p>
      ),
    },
  ];

  return <OnboardingWizard steps={steps} />;
}

/** The worker's address, big, with copy, a QR code, and a "pay me" link that pre-fills the employer's form */
function AddressShare({ address, onShared }: { address: Address; onShared: () => void }) {
  const [copied, setCopied] = useState<"address" | "link" | null>(null);
  const payMeLink = typeof window === "undefined" ? "" : `${window.location.origin}/employer?payee=${address}#streams`;
  const copy = (text: string, what: "address" | "link") =>
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      onShared();
    });
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-center">
      <div className="w-fit rounded-2xl bg-gloss-white p-4">
        <QRCode value={address} size={140} fgColor="#17150e" bgColor="#f0f7f6" />
      </div>
      <div className="flex flex-col gap-4">
        <code className="font-mono text-subheading break-all">{address}</code>
        <p className="text-caption text-soft-charcoal">
          The pay-me link opens your employer&apos;s console with your address already filled in.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => copy(payMeLink, "link")}>{copied === "link" ? "✓ Link copied" : "Copy pay-me link"}</Button>
          <Button variant="outline" onClick={() => copy(address, "address")}>
            {copied === "address" ? "✓ Copied" : "Copy address"}
          </Button>
          <Button variant="outline" onClick={onShared}>
            I&apos;ve shared it
          </Button>
        </div>
      </div>
    </div>
  );
}
