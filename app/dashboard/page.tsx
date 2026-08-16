import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-suspenders: middleware already guards /dashboard, but we check
  // here too so the page never renders for a logged-out user.
  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <header className="top">
        <div className="topin">
          <div className="logo">S</div>
          <div className="brand">
            SOCIA<span>Dashboard</span>
          </div>
          <form action="/auth/signout" method="post" style={{ marginLeft: "auto" }}>
            <button className="signout" type="submit">
              Log out
            </button>
          </form>
        </div>
      </header>

      <div className="wrap">
        <div className="dash">
          <div className="eyebrow" style={{ color: "var(--cobalt)" }}>
            You&apos;re logged in
          </div>
          <h1>Welcome back 👋</h1>
          <p className="dashsub">
            Signed in as <b>{user.email}</b>
          </p>

          <div className="dashcard">
            <h3>Concierge Engine</h3>
            <p>
              Generate a content audit, competitor breakdown, and weekly plan
              for a client account.
            </p>
            <Link className="dashlink" href="/tool">
              Open the tool →
            </Link>
          </div>

          <div className="dashcard muted">
            <h3>Coming soon</h3>
            <p>
              Saved plans, client history, and analytics will live here once
              they&apos;re built.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
