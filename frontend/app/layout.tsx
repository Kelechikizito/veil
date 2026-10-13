import type { Metadata } from "next";
import { Bowlby_One, Inter } from "next/font/google";
import "./globals.css";
import { NetworkBanner } from "@/components/NetworkBanner";
import { Providers } from "./providers";

// Stand-ins for Aeonik Pro (UI) and Lateral (display) from DESIGN.md
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const bowlby = Bowlby_One({
  variable: "--font-bowlby",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Veil — payroll by the second",
  description:
    "Stream salaries by the second on Monad. Employers vouch for workers, workers confirm with a passkey, and income proofs expire.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${bowlby.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <NetworkBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
