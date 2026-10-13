import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { Badge, ButtonLink, PageTitle, Section } from "./ui";

/** Shell for routes whose checkpoint isn't built yet */
export function PlaceholderPage({
  checkpoint,
  title,
  children,
}: {
  checkpoint: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <Section tone="sky" className="flex-1">
        <div className="flex max-w-3xl flex-col gap-8">
          <Badge ghost>Checkpoint {checkpoint}</Badge>
          <PageTitle stickers={["star", "clock"]}>{title}</PageTitle>
          <div className="text-subheading text-carbon/70">{children}</div>
          <div>
            <ButtonLink href="/" variant="outline">
              ← Back home
            </ButtonLink>
          </div>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
