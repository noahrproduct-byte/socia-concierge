"use client";

// Add / track competitors. One drawer: a handle to add by hand, the accounts
// SOCIA discovered but the user is not tracking yet, and the tracked list.
// Tracking stores a handle; it never invents that account's numbers.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Check, ExternalLink, Loader2, Plus, X } from "lucide-react";
import Drawer from "@/components/ov/Drawer";
import type { CompetitorRow } from "@/lib/competitorIntel";
import type { Tracked } from "./types";
import { Avatar, PlatformMark, classLabel, fmtN, platName } from "./shared";

const profileUrl = (c: Tracked) =>
  c.platform === "facebook" ? `https://facebook.com/${c.handle}` : c.platform === "youtube" ? `https://youtube.com/@${c.handle}` : `https://instagram.com/${c.handle}`;

export default function AddCompetitor({ open, onClose, tracked, suggestions }: { open: boolean; onClose: () => void; tracked: Tracked[]; suggestions: CompetitorRow[] }) {
  const router = useRouter();
  const [list, setList] = useState<Tracked[]>(tracked);
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<"instagram" | "youtube" | "facebook">("instagram");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isTracked = (p: string, h: string) => list.some((x) => x.platform === p && x.handle === h.toLowerCase());

  const track = useCallback(async (p: string, h: string) => {
    const clean = h.trim().replace(/^@/, "");
    if (!clean) return;
    setBusy(`${p}:${clean}`); setErr(null);
    try {
      const res = await fetch("/api/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: clean, platform: p }) });
      const j = await res.json();
      if (!res.ok) { setErr(j.error ?? "Couldn't add that handle."); return; }
      setList((xs) => isTracked(p, clean) ? xs : [...xs, { platform: p, handle: clean.toLowerCase(), added_at: new Date().toISOString() }]);
      setHandle("");
      router.refresh();
    } finally { setBusy(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, list]);

  const remove = useCallback(async (c: Tracked) => {
    setList((xs) => xs.filter((x) => !(x.handle === c.handle && x.platform === c.platform)));
    await fetch("/api/competitors", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: c.handle, platform: c.platform }) });
    router.refresh();
  }, [router]);

  const untracked = suggestions.filter((s) => !isTracked(s.platform, s.handle));

  return (
    <Drawer open={open} title="Add competitor" onClose={onClose} width={480}>
      <div className="cx-add">
        <div className="ov-seg cx-add-seg" role="group" aria-label="Platform">
          {(["instagram", "youtube", "facebook"] as const).map((p) => (
            <button key={p} type="button" className={platform === p ? "on" : ""} onClick={() => setPlatform(p)}>{platName(p)}</button>
          ))}
        </div>
        <p className="cx-add-note">
          {platform === "youtube"
            ? "YouTube publishes real statistics for any channel: subscribers, recent uploads, views and engagement all appear once tracked."
            : platform === "instagram"
              ? "Instagram shares another account's public numbers only through a Facebook Page linked to your account. Until then SOCIA links the profile and flags its posts in niche research."
              : "Facebook publishes nothing about Pages you don't manage. SOCIA keeps the profile link and never estimates its numbers."}
        </p>
        <form className="cx-add-form" onSubmit={(e) => { e.preventDefault(); track(platform, handle); }}>
          <span className="cx-add-at"><AtSign size={13} /></span>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={platform === "youtube" ? "@channel, URL or channel ID" : "handle"} aria-label="Competitor handle" />
          <button type="submit" className="ov-btn primary small" disabled={Boolean(busy) || !handle.trim()}>
            {busy === `${platform}:${handle.trim().replace(/^@/, "")}` ? <Loader2 size={13} className="cx-spin" /> : <Plus size={13} />} Add
          </button>
        </form>
        {err && <p className="cx-add-err">{err}</p>}

        {untracked.length > 0 && (
          <section className="cx-add-sec">
            <h4>Discovered by SOCIA</h4>
            <ul className="cx-add-list">
              {untracked.slice(0, 12).map((r) => (
                <li key={r.id}>
                  <Avatar src={r.avatar} name={r.name} size={34} />
                  <span className="cx-add-id">
                    <b title={r.name}>{r.name}</b>
                    <small><PlatformMark p={r.platform} size={10} /> @{r.handle}{classLabel(r.classification) ? ` · ${classLabel(r.classification)}` : ""}{r.match != null ? ` · ${r.match}% match` : ""}</small>
                    <small>{r.audience.state === "ok" ? `${fmtN(r.audience.value)} ${r.platform === "youtube" ? "subscribers" : "followers"}` : "Followers not published"}</small>
                  </span>
                  <button type="button" className="ov-btn ghost small" onClick={() => track(r.platform, r.handle)} disabled={busy === `${r.platform}:${r.handle}`}>
                    {busy === `${r.platform}:${r.handle}` ? <Loader2 size={12} className="cx-spin" /> : <Plus size={12} />} Track
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="cx-add-sec">
          <h4>Tracking ({list.length})</h4>
          {list.length ? (
            <ul className="cx-add-list">
              {list.map((c) => (
                <li key={c.platform + c.handle}>
                  <Avatar src={null} name={c.handle} size={34} />
                  <span className="cx-add-id">
                    <b>@{c.handle}</b>
                    <small><PlatformMark p={c.platform} size={10} /> {platName(c.platform)} · since {new Date(c.added_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>
                  </span>
                  <a href={profileUrl(c)} target="_blank" rel="noreferrer" className="cx-icon-btn" aria-label={`Open @${c.handle}`}><ExternalLink size={13} /></a>
                  <button type="button" className="cx-icon-btn" onClick={() => remove(c)} aria-label={`Stop tracking @${c.handle}`}><X size={13} /></button>
                </li>
              ))}
            </ul>
          ) : <p className="cx-empty small">No competitors tracked yet. Track one above, or pick from the discovered list.</p>}
        </section>
        <p className="cx-add-foot"><Check size={11} /> Tracked accounts stay in the roster and are refreshed with every discovery run.</p>
      </div>
    </Drawer>
  );
}
