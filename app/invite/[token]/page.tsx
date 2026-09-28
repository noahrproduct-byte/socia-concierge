import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { inviteByToken, teamEnabled } from "@/lib/team";
import BrandMark from "@/components/BrandMark";
import AcceptInvite from "./AcceptInvite";
import "./invite.css";

// The invite landing page. Signed-out people are sent to log in (or sign up)
// and come straight back here. Nothing about the workspace is shown until the
// token is valid, and the token itself is never rendered.

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const enabled = await teamEnabled(supabase);
  const inv = enabled ? await inviteByToken(supabase, token) : null;

  let body: React.ReactNode;
  if (!enabled) {
    body = <p className="inv-note">Team features are not available on this server yet.</p>;
  } else if (!inv) {
    body = <p className="inv-note">This invite link is not valid.</p>;
  } else if (inv.status !== "open") {
    body = (
      <p className="inv-note">
        {inv.status === "revoked" && "This invite was cancelled by the workspace owner."}
        {inv.status === "used" && "This invite has already been used."}
        {inv.status === "expired" && "This invite has expired. Ask for a new link."}
      </p>
    );
  } else if (inv.ownerId === user.id) {
    body = <p className="inv-note">You own this workspace, so you are already in it.</p>;
  } else {
    body = (
      <>
        <p className="inv-lead">
          You have been invited to join <strong>{inv.workspaceName}</strong> as {inv.role === "admin" ? "an Admin" : "a Member"}.
        </p>
        <p className="inv-sub">
          {inv.role === "admin"
            ? "Admins can do everything in the workspace except change the plan or delete it."
            : "Members can see everything, use SOCIA's intelligence and draft content; publishing and account changes stay with the owner and admins."}
        </p>
        <AcceptInvite token={token} />
      </>
    );
  }

  return (
    <main className="inv">
      <div className="inv-card">
        <div className="inv-brand"><BrandMark size={28} /><span>SOCIA</span></div>
        <h1 className="inv-title">Workspace invite</h1>
        {body}
        <p className="inv-foot">Signed in as {user.email}. <Link href="/dashboard">Go to SOCIA</Link></p>
      </div>
    </main>
  );
}
