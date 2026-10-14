// The AI apps Settings → AI Assistants explains, and whether SOCIA has
// actually tested each one's connection flow end to end. Flip `tested` only
// after a real connect → consent → tool call → disconnect has passed with
// that app; until then the page says so plainly.
export type AssistantClient = { id: string; name: string; tested: boolean; steps: string[] };

export const ASSISTANT_CLIENTS: AssistantClient[] = [
  {
    id: "claude", name: "Claude", tested: false,
    steps: [
      "In Claude, open Settings → Connectors and choose Add custom connector.",
      "Name it SOCIA and paste the address above, then Connect.",
      "Sign in to SOCIA, choose which Brand Workspaces to share, and Allow.",
    ],
  },
  {
    id: "chatgpt", name: "ChatGPT", tested: false,
    steps: [
      "In ChatGPT's settings, turn on developer mode for apps and connectors.",
      "Create a connector named SOCIA with the address above and OAuth sign-in.",
      "Sign in to SOCIA, choose which Brand Workspaces to share, and Allow.",
    ],
  },
  {
    id: "other", name: "Other MCP apps", tested: false,
    steps: [
      "Add a remote MCP server (Streamable HTTP) with the address above.",
      "When it asks you to sign in, approve it on SOCIA's screen.",
    ],
  },
];
