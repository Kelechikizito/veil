import { ProposalReview } from "@/components/agents/ProposalReview";
import { AppGate } from "@/components/AppGate";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Badge, PageTitle, Section } from "@/components/ui";

export const metadata = { title: "Review and sign — Veil" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** /sign?to=…&data=…&note=…: review a transaction an agent proposed, then sign it yourself */
export default async function SignPage(props: PageProps<"/sign">) {
  const q = await props.searchParams;
  return (
    <>
      <SiteHeader />
      <Section tone="sky" className="flex-1 !py-12 md:!py-16">
        <div className="flex max-w-3xl flex-col gap-8">
          <div className="flex flex-col gap-4">
            <Badge ghost>Review</Badge>
            <PageTitle stickers={["check", "lock"]}>Review and sign</PageTitle>
            <p className="text-subheading">
              An agent drafted this for you. Nothing happens until you sign it. If it isn&apos;t what you asked for, don&apos;t
              sign.
            </p>
          </div>
          <AppGate>
            <ProposalReview to={one(q.to)} data={one(q.data)} note={one(q.note)} />
          </AppGate>
        </div>
      </Section>
      <SiteFooter />
    </>
  );
}
