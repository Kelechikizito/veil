import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Section } from "@/components/ui";
import { CredentialView } from "@/components/verify/CredentialView";
import { VerifierBriefs } from "@/components/agents/RoleBriefs";

export default async function VerifyCredential(props: PageProps<"/verify/[id]">) {
  const { id } = await props.params;
  return (
    <>
      <SiteHeader />
      <Section tone="sky" className="flex-1 !py-12 md:!py-16">
        <div className="flex flex-col gap-8">
          <CredentialView id={id} />
          <VerifierBriefs id={id} />
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
