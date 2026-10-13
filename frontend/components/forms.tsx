"use client";

import type { ComponentProps, ReactNode } from "react";
import { useWizardEmbed } from "./OnboardingWizard";

/*
 * Form and panel primitives for the console. Inputs are pills with a 1px black outline, panels are 20px outlined cards.
 */

/** A titled block in the console */
export function Panel({
  title,
  help,
  aside,
  children,
}: {
  title: string;
  help?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  // Inside the onboarding wizard the card already shows the title and help, so drop the frame
  const embedded = useWizardEmbed();
  if (embedded) {
    return (
      <div className="flex flex-col gap-6">
        {aside && <div>{aside}</div>}
        {children}
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-6 rounded-cards border border-carbon bg-paper-white p-6 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-subheading font-bold">{title}</h2>
          {help && <p className="max-w-xl text-caption text-carbon/70">{help}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** A labelled field */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label-type text-caption uppercase">{label}</span>
      {children}
      {hint && <span className="text-caption text-carbon/70">{hint}</span>}
    </label>
  );
}

/** Text input */
export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      data-cuelume-type=""
      className={`w-full rounded-pills border border-carbon bg-paper-white px-4 py-3 text-body outline-none transition-colors focus:border-carbon ${className}`}
      {...props}
    />
  );
}

/** A row of pills to pick one option */
export function PillPicker<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-cuelume-select=""
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`label-type rounded-pills px-4 py-2 text-caption transition-colors ${
            value === o.value ? "border border-carbon bg-carbon text-paper-white" : "border border-carbon bg-paper-white hover:bg-soft-mist"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A label–value row */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-carbon/10 py-3">
      <span className="label-type text-caption uppercase">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
