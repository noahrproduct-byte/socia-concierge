import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { activeWorkspaceId, listAccessibleWorkspaces } from "@/lib/workspaces";
import { createConsentRequest, validateAuthorize } from "@/lib/oauth/server";
import { oauthStore, serviceOrNull } from "@/lib/oauth/runtime";
import BrandMark from "@/components/BrandMark";
import ConsentScreen from "@/components/oauth/ConsentScreen";
import "../oauth.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect an app — SOCIA", robots: { index: false } };

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="oa">
      <div className="oa-card">
        <div className="oa-brand"><BrandMark size={28} /> SOCIA</div>
        {children}
      </div>
    </main>
  );
}

// The consent screen an AI app (Claude, ChatGPT, another MCP client) sends a
// person to. Problems with the app itself are shown here and never redirected.
// The person chooses which Brand Workspaces the app may read; nothing is
// granted without the Allow button, and the app's own name is shown next to
// the address it will return to, because an app can call itself anything.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const params: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) params[k] = first(v);

  const store = oauthStore();
  const svc = serviceOrNull();
  if (!store || !svc) {
    return <Shell><h1>Not available yet</h1><p className="oa-sub">Connecting AI apps isn&apos;t set up on this server yet.</p></Shell>;
  }

  const now = new Date();
  const a = await validateAuthorize(store, params, now).catch((e) => {
    console.error("[oauth] authorize", (e as Error)?.message ?? e);
    return { kind: "error_page" as const, message: "SOCIA couldn't read this connection request. Try again from the app." };
  });
  if (a.kind === "error_page") {
    return <Shell><h1>This app can&apos;t connect</h1><p className="oa-sub">{a.message}</p></Shell>;
  }
  if (a.kind === "redirect") redirect(a.url);

  const { supabase, user } = await getViewer();
  if (!user) {
    const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] != null)).toString();
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);
  }

  const [workspaces, active] = await Promise.all([
    listAccessibleWorkspaces(svc, user.id).then((ws) => ws.filter((w) => !w.suspended)),
    activeWorkspaceId(supabase, user.id).catch(() => null),
  ]);
  if (!workspaces.length) {
    return <Shell><h1>No Brand Workspace yet</h1><p className="oa-sub">Finish setting up SOCIA first, then connect the app again.</p></Shell>;
  }

  const requestId = await createConsentRequest(store, user.id, a, now);
  const name = a.client.clientName || "An app";
  const host = new URL(a.redirectUri).host;
  const checked = new Set(active && workspaces.some((w) => w.id === active) ? [active] : [workspaces[0].id]);

  return (
    <Shell>
      <ConsentScreen
        name={name}
        host={host}
        scopes={a.scopes}
        askedToPublish={a.askedToPublish}
        requestId={requestId}
        email={user.email ?? null}
        workspaces={workspaces.map((w) => ({
          id: w.id, name: w.name, checked: checked.has(w.id),
          note: w.ownerId !== user.id ? (w.role === "admin" ? "Admin" : "Member") : null,
        }))}
      />
    </Shell>
  );
}
