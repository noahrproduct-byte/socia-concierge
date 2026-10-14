import { authorizationServerMetadata } from "@/lib/oauth/config";
import { json, preflight } from "@/lib/oauth/runtime";

// RFC 8414: how MCP clients find SOCIA's OAuth endpoints.
export function GET() {
  return json(authorizationServerMetadata(), 200, { "Cache-Control": "public, max-age=300" });
}
export const OPTIONS = preflight;
