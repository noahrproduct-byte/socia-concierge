import { protectedResourceMetadata } from "@/lib/oauth/config";
import { json, preflight } from "@/lib/oauth/runtime";

// RFC 9728 at the root well-known path (the MCP endpoint's own path is the
// /mcp sibling; both describe the same resource).
export function GET() {
  return json(protectedResourceMetadata(), 200, { "Cache-Control": "public, max-age=300" });
}
export const OPTIONS = preflight;
