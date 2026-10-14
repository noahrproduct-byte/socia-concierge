import Link from "next/link";
import { DECIDE_MESSAGES, type DecideError } from "@/lib/oauth/server";
import BrandMark from "@/components/BrandMark";
import "../oauth.css";

export const metadata = { title: "Connect an app — SOCIA", robots: { index: false } };

// Messages are chosen by code, never taken from the URL, so a crafted link
// can't put words on a sociaos.com page.
const OTHER: Record<string, string> = {
  unavailable: "Connecting AI apps isn't set up on this server yet.",
  server: "Something went wrong on SOCIA's side. Start again from the app.",
};

export default async function OAuthErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = (reason && (DECIDE_MESSAGES[reason as DecideError] ?? OTHER[reason])) || OTHER.server;
  return (
    <main className="oa">
      <div className="oa-card">
        <div className="oa-brand"><BrandMark size={28} /> SOCIA</div>
        <h1>The app wasn&apos;t connected</h1>
        <p className="oa-sub">{message}</p>
        <Link href="/settings#ai-assistants" className="oa-btn ghost">Go to AI Assistants</Link>
      </div>
    </main>
  );
}
