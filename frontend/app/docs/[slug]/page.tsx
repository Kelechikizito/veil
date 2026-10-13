import { notFound } from "next/navigation";
import { CopyForAgents } from "@/components/agents/AgentTools";
import { DocsShell } from "@/components/docs/DocsShell";
import { Markdown } from "@/components/docs/Markdown";
import { docPages } from "@/lib/agentDocs";

export function generateStaticParams() {
  return docPages().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/docs/[slug]">) {
  const { slug } = await props.params;
  const page = docPages().find((p) => p.slug === slug);
  return page ? { title: `${page.title} — Veil docs`, description: page.summary } : {};
}

export default async function DocPage(props: PageProps<"/docs/[slug]">) {
  const { slug } = await props.params;
  const page = docPages().find((p) => p.slug === slug);
  if (!page) notFound();
  return (
    <DocsShell current={slug}>
      <article className="flex flex-col gap-6 rounded-cards-elevated border border-carbon bg-paper-white p-6 md:p-10">
        <CopyForAgents slug={slug} />
        <Markdown source={page.markdown} />
      </article>
    </DocsShell>
  );
}
