import { protectedResourceMetadata } from "@/lib/oauth/config";
import { json, preflight } from "@/lib/oauth/runtime";

// RFC 9728 for https://sociaos.com/mcp: which authorization server issues its tokens.
export function GET() {
  return json(protectedResourceMetadata(), 200, { "Cache-Control": "public, max-age=300" });
}
export const OPTIONS = preflight;
