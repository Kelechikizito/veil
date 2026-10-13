import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { StickerCluster, type StickerKind } from "./Stickers";

/*
 * Primitives from DESIGN.md. Buttons and tags are pills; cards are 20px or more.
 * Every control has a 1px black outline. No shadows, no gradients.
 */

type ButtonVariant = "dark" | "light" | "outline" | "outline-light";

const buttonBase =
  "label-type inline-flex items-center justify-center gap-2 rounded-buttons border px-5 py-3 text-[14px] leading-none transition-colors duration-150 disabled:cursor-not-allowed";

const buttonVariants: Record<ButtonVariant, string> = {
  // The one highest-priority action per screen
  dark: "border-carbon bg-carbon text-paper-white hover:bg-carbon/80",
  // Highest emphasis on dark surfaces
  light: "border-carbon bg-paper-white text-carbon hover:bg-soft-mist",
  // Secondary action, beside or below the filled one
  outline: "border-carbon bg-paper-white text-carbon hover:bg-soft-mist",
  // Secondary action on black surfaces
  "outline-light": "border-paper-white text-paper-white hover:bg-paper-white/10",
};

/** A pill-shaped link styled as a button. Plays the navigate cue. */
export function ButtonLink({
  variant = "dark",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link data-cuelume-navigate="" className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />;
}

/** A pill-shaped button. Plays the tap cue; pass data-cuelume-* to pick another. */
export function Button({
  variant = "dark",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button data-cuelume-tap="" className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />;
}

/** Status tags and counts (filled) or eyebrow labels (ghost) */
export function Badge({ children, ghost = false }: { children: ReactNode; ghost?: boolean }) {
  return (
    <span
      className={
        ghost
          ? "label-type inline-flex w-fit items-center rounded-pills border border-carbon bg-paper-white px-3 py-1.5 text-caption uppercase"
          : "inline-flex w-fit items-center rounded-pills border border-carbon bg-lavender px-3 py-1 text-caption"
      }
    >
      {children}
    </span>
  );
}

/** The 1200px content frame */
export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1440px] px-6 ${className}`}>{children}</div>;
}

const tones = { sky: "bg-sky-wash", white: "bg-paper-white", gray: "bg-concrete-gray" } as const;

/** A full-bleed color band. Alternate sky → white → gray down the page. */
export function Section({
  children,
  tone = "white",
  className = "",
  id,
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`${tones[tone]} py-20 md:py-28 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

/** A page's display headline, always paired with a sticker cluster (DESIGN.md: display type never stands alone) */
export function PageTitle({ children, stickers }: { children: ReactNode; stickers: [StickerKind, StickerKind] }) {
  return (
    <div className="flex items-end gap-4">
      <h1 className="display-type text-[36px] sm:text-[48px] md:text-display-70">{children}</h1>
      <StickerCluster kinds={stickers} className="hidden sm:inline-block" />
    </div>
  );
}
