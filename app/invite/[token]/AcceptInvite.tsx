"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/invite/${token}`, { method: "POST" });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErr(j?.error ?? "The invite could not be accepted. Please try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setErr("The invite could not be accepted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inv-actions">
      <button type="button" className="btn-primary" onClick={accept} disabled={busy}>
        {busy ? <Loader2 size={15} className="acsw-spin" /> : "Join workspace"}
      </button>
      {err && <p className="inv-err" role="alert">{err}</p>}
    </div>
  );
}
