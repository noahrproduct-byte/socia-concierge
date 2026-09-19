import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { createServiceClient } from "@/lib/supabase/service";
import { readDeletionStatus } from "@/lib/metaDeletion";

export const metadata = { title: "Data Deletion | SOCIA" };
export const dynamic = "force-dynamic";

// Meta's "User data deletion" instructions URL, and the status page its
// deletion callback points people to. Plain language, and every sentence
// describes what the code actually does (lib/metaDeletion.ts).

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const clean = (code ?? "").trim().toLowerCase();
  let status: Awaited<ReturnType<typeof readDeletionStatus>> = null;
  let looked = false;
  if (/^[0-9a-f]{20}$/.test(clean)) {
    looked = true;
    const service = createServiceClient();
    if (service) status = await readDeletionStatus(service, clean);
  }
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "unknown");

  return (
    <main className="legal-page">
      <header className="legal-top">
        <Link href="/" className="legal-brand" aria-label="SOCIA home">
          <BrandMark size={28} />
          <span>SOCIA</span>
        </Link>
        <Link href="/login" className="btn-secondary legal-login">Log in</Link>
      </header>

      <h1>Data deletion</h1>
      <p className="legal-date">How to remove the data SOCIA holds about you and your connected accounts.</p>

      {clean && (
        <section className="legal-status">
          <h2>Request status</h2>
          {status ? (
            <p>
              Request <code>{clean}</code> is <b>{status.status}</b>. Received {fmt(status.requestedAt)}; completed {fmt(status.completedAt)}.
              {Object.keys(status.removed).length > 0 && (
                <> Records removed: {Object.entries(status.removed).map(([k, v]) => `${k.replace(/_/g, " ")} (${v})`).join(", ")}.</>
              )}
            </p>
          ) : looked ? (
            <p>
              No record was found for code <code>{clean}</code>. Deletion requests from Meta are carried out at the moment they arrive, so the data behind that request is already gone; if you want written confirmation, email{" "}
              <a href="mailto:socia.app2026@gmail.com">socia.app2026@gmail.com</a> with the code.
            </p>
          ) : (
            <p>That does not look like a SOCIA confirmation code. Codes are 20 characters of letters and digits.</p>
          )}
        </section>
      )}

      <h2>Remove a connected Instagram or Facebook account</h2>
      <ul>
        <li>In SOCIA, open <Link href="/settings#accounts">Settings, Connected accounts</Link> and choose Disconnect. This deletes the stored access token, the synced profile and posts, and the daily snapshots for that account.</li>
        <li>Or remove SOCIA from Instagram (Settings, Website permissions, Apps and websites) or from Facebook (Settings, Apps and websites). Meta then calls SOCIA&apos;s deletion endpoint and the same records are deleted automatically. Meta shows you a confirmation code; enter it below to see the status of that request.</li>
      </ul>

      <h2 id="check">Check a deletion request</h2>
      <form method="get" action="/data-deletion" className="legal-form">
        <div className="legal-form-field">
          <label htmlFor="deletion-code">Confirmation code</label>
          <input
            id="deletion-code"
            name="code"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            required
            defaultValue={clean}
            placeholder="20 letters and digits"
          />
        </div>
        <button type="submit" className="btn-primary">Check status</button>
      </form>

      <h2>Delete your whole SOCIA account</h2>
      <p>
        Email <a href="mailto:socia.app2026@gmail.com">socia.app2026@gmail.com</a> from the address you signed up with. We delete the account, every connected-account record, saved plans, scheduled posts and uploaded media within 30 days and confirm by reply.
      </p>

      <h2>What is not covered</h2>
      <p>
        Posts SOCIA published to your Instagram account live on Instagram and are yours to keep or delete there. Aggregated, non-identifying product statistics are not tied to you and are not affected.
      </p>

      <p className="legal-links">
        <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link>
      </p>
    </main>
  );
}
