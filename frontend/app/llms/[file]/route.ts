import { docPages, markdownResponse } from "@/lib/agentDocs";

/** GET /llms/{slug}.md: one docs page as Markdown */
export async function GET(request: Request, ctx: RouteContext<"/llms/[file]">) {
  const { file } = await ctx.params;
  const page = docPages(new URL(request.url).origin).find((p) => `${p.slug}.md` === file);
  if (!page) return new Response("Not found. See /llms.txt for the pages.", { status: 404 });
  return markdownResponse(page.markdown);
}
