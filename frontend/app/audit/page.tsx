import { AppGate } from "@/components/AppGate";
import { AuditorView } from "@/components/audit/AuditorView";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, PageTitle, Section } from "@/components/ui";

export default function AuditPage() {
  return (
    <>
      <SiteHeader />
      <Section tone="sky" className="flex-1 !py-12 md:!py-16">
        <div className="flex flex-col gap-8">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge ghost>Auditor</Badge>
            <PageTitle stickers={["eye", "coin"]}>The full ledger, for you alone</PageTitle>
            <p className="text-subheading text-carbon/70">
              Employers that named you their auditor let you read every salary, withdrawal and vault balance from then on.
            </p>
          </div>
          <AppGate>
            <AuditorView />
          </AppGate>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
