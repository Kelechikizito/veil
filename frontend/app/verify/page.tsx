import { AppGate } from "@/components/AppGate";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, PageTitle, Section } from "@/components/ui";
import { VerifierHome } from "@/components/verify/VerifierHome";
import { VerifierBriefs } from "@/components/agents/RoleBriefs";

export default function VerifierPage() {
  return (
    <>
      <SiteHeader />
      <Section tone="sky" className="flex-1 !py-12 md:!py-16">
        <div className="flex flex-col gap-8">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge ghost>Verifier</Badge>
            <PageTitle stickers={["lock", "star"]}>Check an income, not a salary</PageTitle>
            <p className="text-subheading text-carbon/70">
              A worker can prove they earn at least an amount you choose. You learn yes or no, never the figure.
            </p>
          </div>
          <AppGate>
            <VerifierHome />
            <VerifierBriefs />
          </AppGate>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
