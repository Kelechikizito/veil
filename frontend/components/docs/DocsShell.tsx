import Link from "next/link";
import type { ReactNode } from "react";
import { docPages } from "@/lib/agentDocs";
import { SiteFooter, SiteHeader } from "../SiteChrome";
import { Section } from "../ui";

/** Docs layout: page list on the left, the page on the right, on the sky band */
export function DocsShell({ current, children }: { current?: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <Section tone="sky" className="flex-1 !py-12 md:!py-16">
        <div className="grid gap-8 lg:grid-cols-[220px_1fr] lg:gap-12">
          <nav aria-label="Docs" className="flex flex-wrap gap-2 lg:flex-col lg:items-start">
            <Link
              href="/docs"
              data-cuelume-navigate=""
              aria-current={current === undefined ? "page" : undefined}
              className={`label-type rounded-nav border border-carbon px-4 py-2.5 text-[13px] uppercase ${
                current === undefined ? "bg-carbon text-paper-white" : "bg-paper-white hover:bg-soft-mist"
              }`}
            >
              All docs
            </Link>
            {docPages().map((p) => (
              <Link
                key={p.slug}
                href={`/docs/${p.slug}`}
                data-cuelume-navigate=""
                aria-current={current === p.slug ? "page" : undefined}
                className={`label-type rounded-nav border border-carbon px-4 py-2.5 text-[13px] uppercase ${
                  current === p.slug ? "bg-carbon text-paper-white" : "bg-paper-white hover:bg-soft-mist"
                }`}
              >
                {p.title}
              </Link>
            ))}
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
