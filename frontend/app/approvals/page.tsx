import { AppGate } from "@/components/AppGate";
import { ApprovalsSection } from "@/components/employer/ApprovalsSection";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, PageTitle, Section } from "@/components/ui";
import { ApproverBriefs } from "@/components/agents/RoleBriefs";

/** /approvals: for approvers, who may have no org of their own */
export default function ApprovalsPage() {
  return (
    <>
      <SiteHeader />
      <Section tone="sky" className="flex-1 !py-12 md:!py-16">
        <div className="flex flex-col gap-8">
          <div className="flex max-w-3xl flex-col gap-4">
            <Badge ghost>Approver</Badge>
            <PageTitle stickers={["coin", "check"]}>Salaries waiting for you</PageTitle>
            <p className="text-subheading text-carbon/70">
              An employer named you an approver. Salaries above their limit start only once enough approvers say
              yes.
            </p>
          </div>
          <AppGate>
            <ApprovalsSection />
            <ApproverBriefs />
          </AppGate>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
