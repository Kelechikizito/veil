import { llmsIndex, markdownResponse } from "@/lib/agentDocs";

/** GET /llms.txt: the docs index for agents (llmstxt.org) */
export async function GET(request: Request) {
  return markdownResponse(llmsIndex(new URL(request.url).origin));
}
