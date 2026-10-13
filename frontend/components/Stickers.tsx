import type { CSSProperties, ReactNode } from "react";

/*
 * Flat stickers and the blue ribbon from DESIGN.md. Every shape has a 1px black outline
 * (non-scaling, so it stays 1px at any size) and one flat fill from the sticker palette. No gradients.
 * All of it is decoration: hidden from screen readers.
 */

export type StickerKind = "coin" | "check" | "wallet" | "lock" | "clock" | "eye" | "key" | "star";

const C = {
  carbon: "var(--color-carbon)",
  white: "var(--color-paper-white)",
  blue: "var(--color-electric-blue)",
  mint: "var(--color-mint-pop)",
  lavender: "var(--color-lavender)",
  ember: "var(--color-ember)",
  sun: "var(--color-sunburst)",
  violet: "var(--color-voltage-violet)",
};

/** Shared stroke props: a 1px black outline that ignores the SVG's scale */
const ink = { stroke: C.carbon, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
/** Heavier line work for the glyph drawn on a sticker */
const glyph = {
  stroke: C.carbon,
  strokeWidth: 5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

const art: Record<StickerKind, ReactNode> = {
  // Gold coin with a stacked rim
  coin: (
    <>
      <circle cx="52" cy="54" r="40" fill={C.sun} {...ink} />
      <circle cx="48" cy="48" r="40" fill={C.sun} {...ink} />
      <circle cx="48" cy="48" r="28" fill="none" {...ink} />
      <path d="M48 32v32M56 38c-2-3-5-4-8-4-5 0-8 2-8 6 0 9 17 4 17 13 0 4-4 6-9 6-4 0-7-1-9-4" {...glyph} />
    </>
  ),
  // Green checkmark badge
  check: (
    <>
      <rect x="10" y="10" width="76" height="76" rx="22" fill={C.mint} {...ink} />
      <path d="M30 50l12 12 24-28" {...glyph} strokeWidth={8} />
    </>
  ),
  // Purple wallet with a clasp
  wallet: (
    <>
      <rect x="8" y="22" width="80" height="58" rx="16" fill={C.violet} {...ink} />
      <path d="M8 38c0-9 7-16 16-16h48" fill="none" {...ink} />
      <rect x="56" y="42" width="32" height="20" rx="10" fill={C.lavender} {...ink} />
      <circle cx="68" cy="52" r="4" fill={C.carbon} />
    </>
  ),
  // Ember padlock
  lock: (
    <>
      <path d="M30 42V32a18 18 0 0 1 36 0v10" fill="none" stroke={C.carbon} strokeWidth={9} strokeLinecap="round" />
      <path d="M30 42V32a18 18 0 0 1 36 0v10" fill="none" stroke={C.white} strokeWidth={6} strokeLinecap="round" />
      <rect x="14" y="40" width="68" height="50" rx="18" fill={C.ember} {...ink} />
      <circle cx="48" cy="61" r="6" fill={C.carbon} />
      <path d="M48 64v10" {...glyph} />
    </>
  ),
  // Blue stopwatch: pay by the second
  clock: (
    <>
      <rect x="40" y="4" width="16" height="10" rx="5" fill={C.sun} {...ink} />
      <circle cx="48" cy="54" r="38" fill={C.blue} {...ink} />
      <circle cx="48" cy="54" r="27" fill={C.white} {...ink} />
      <path d="M48 54V38M48 54l10 8" {...glyph} />
    </>
  ),
  // Lavender eye with a slash: hidden from view
  eye: (
    <>
      <path d="M6 48C18 26 33 16 48 16s30 10 42 32C78 70 63 80 48 80S18 70 6 48z" fill={C.lavender} {...ink} />
      <circle cx="48" cy="48" r="16" fill={C.violet} {...ink} />
      <circle cx="48" cy="48" r="6" fill={C.carbon} />
      <path d="M18 80L78 16" stroke={C.carbon} strokeWidth={9} strokeLinecap="round" />
      <path d="M18 80L78 16" stroke={C.white} strokeWidth={5} strokeLinecap="round" />
    </>
  ),
  // Mint passkey
  key: (
    <>
      <circle cx="30" cy="40" r="22" fill={C.mint} {...ink} />
      <circle cx="30" cy="40" r="7" fill={C.white} {...ink} />
      <path d="M46 54l36 36M66 74l10-10M74 82l8-8" stroke={C.carbon} strokeWidth={11} strokeLinecap="round" />
      <path d="M46 54l36 36M66 74l10-10M74 82l8-8" stroke={C.mint} strokeWidth={8} strokeLinecap="round" />
    </>
  ),
  // Sunburst star
  star: (
    <path
      d="M48 6l11 26 28 3-21 19 6 28-24-14-24 14 6-28L9 35l28-3z"
      fill={C.sun}
      strokeLinejoin="round"
      {...ink}
    />
  ),
};

/**
 * One sticker, absolutely positioned by the caller.
 * @param size Rendered width and height in px
 * @param rotate Tilt in degrees; stickers are never grid-aligned
 */
export function Sticker({
  kind,
  size = 72,
  rotate = 0,
  className = "",
  style,
}: {
  kind: StickerKind;
  size?: number;
  rotate?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-hidden
      className={`pointer-events-none shrink-0 overflow-visible select-none ${className}`}
      style={{ transform: `rotate(${rotate}deg)`, ...style }}
    >
      {art[kind]}
    </svg>
  );
}

/** A small cluster of stickers to sit beside a page title */
export function StickerCluster({ kinds, className = "" }: { kinds: [StickerKind, StickerKind]; className?: string }) {
  return (
    <span aria-hidden className={`relative inline-block h-20 w-28 shrink-0 ${className}`}>
      <Sticker kind={kinds[0]} size={64} rotate={-12} className="absolute top-0 left-0" />
      <Sticker kind={kinds[1]} size={52} rotate={14} className="absolute right-0 bottom-0" />
    </span>
  );
}

/*
 * The ribbon: an inflated blue tube. Each segment is drawn as a black outline, the blue body,
 * a shadow line and a highlight line, then a grain filter. Drawing segment by segment makes
 * later segments pass over earlier ones, so the tube reads as looping over itself.
 */

const RIBBONS = {
  // Hero: sweeps in from the left, loops behind the headline, exits right
  hero: {
    viewBox: "0 0 1440 760",
    width: 120,
    segments: [
      "M-80 600 C 180 640, 360 520, 420 380 S 380 120, 560 110",
      "M560 110 C 760 100, 860 300, 760 430 S 520 520, 600 330",
      "M600 330 C 680 160, 980 120, 1120 260 S 1300 560, 1540 470",
    ],
  },
  // Section accent: a single arc across the top
  arc: {
    viewBox: "0 0 1440 300",
    width: 90,
    segments: ["M-60 250 C 260 40, 560 20, 760 140 S 1180 280, 1500 60"],
  },
  // Footer: a loop under the wordmark
  loop: {
    viewBox: "0 0 1440 400",
    width: 100,
    segments: ["M-60 120 C 300 360, 640 380, 760 240", "M760 240 C 860 120, 1100 60, 1500 300"],
  },
} as const;

export function Ribbon({ variant = "hero", className = "" }: { variant?: keyof typeof RIBBONS; className?: string }) {
  const r = RIBBONS[variant];
  const id = `grain-${variant}`;
  return (
    <svg
      viewBox={r.viewBox}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full select-none ${className}`}
    >
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
          <feComposite in="mono" in2="SourceGraphic" operator="in" result="grain" />
          <feBlend in="SourceGraphic" in2="grain" mode="multiply" />
        </filter>
      </defs>
      <g filter={`url(#${id})`} fill="none" strokeLinecap="round">
        {r.segments.map((d) => (
          <g key={d}>
            <path d={d} stroke={C.carbon} strokeWidth={r.width + 3} />
            <path d={d} stroke={C.blue} strokeWidth={r.width} />
            <path d={d} stroke={C.carbon} strokeOpacity={0.14} strokeWidth={r.width * 0.3} transform={`translate(0 ${r.width * 0.28})`} />
            <path d={d} stroke={C.white} strokeOpacity={0.45} strokeWidth={r.width * 0.12} transform={`translate(0 ${-r.width * 0.24})`} />
          </g>
        ))}
      </g>
    </svg>
  );
}
