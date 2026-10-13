import { docPages, markdownResponse } from "@/lib/agentDocs";

/** GET /llms-full.txt: every docs page in one file */
export async function GET(request: Request) {
  const base = new URL(request.url).origin;
  return markdownResponse(docPages(base).map((p) => p.markdown).join("\n\n---\n\n"));
}
