"use client";

// The person's filming sessions (lib/filmingPlan.ts): the current plan's
// posts laid out over the days they said they can film. On the Content Plan
// it shows every session and anything that couldn't be placed; on the
// Dashboard only the session being filmed today or the next one. It reads
// only: nothing on the plan or the Calendar moves. Renders nothing when there
// is nothing to film.
import { useEffect, useState } from "react";
import Link from "next/link";
import Sio from "@/components/sio/Sio";
import { FILM_MINUTES } from "@/lib/filmingPlan";
import { filmTime } from "@/lib/routine";
import type { FilmingView } from "@/lib/filmingLoad";

const long = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

export default function FilmingSessions({ where }: { where: "plan" | "dashboard" }) {
  const [v, setV] = useState<FilmingView | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/filming").then((r) => (r.ok ? r.json() : null)).then((j: FilmingView | null) => { if (alive && j && !("error" in j)) setV(j); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (!v) return null;

  if (!v.hasFilmingDays) {
    // Only the plan says so, and only when there is something to film.
    if (where !== "plan" || !v.planId || v.total === 0) return null;
    return (
      <section className="film is-ask">
        <p className="film-note">Tell SIO which days you can film and it lays these posts out around them. <Link href="/settings#growth" className="s-link">Set your routine</Link></p>
      </section>
    );
  }

  const sessions = where === "dashboard" ? (v.next ? [v.next.session] : []) : v.sessions;
  const unplaced = where === "dashboard" ? [] : v.unplaced;
  if (!sessions.length && !unplaced.length) return null;
  const today = v.next?.isToday ?? false;
  const left = [v.left_out.animated ? `${v.left_out.animated} animated ${v.left_out.animated === 1 ? "post needs" : "posts need"} no filming` : "", v.left_out.claude ? `${v.left_out.claude} ${v.left_out.claude === 1 ? "is" : "are"} made by your Claude` : ""].filter(Boolean).join(", and ");

  return (
    <section className={`film${where === "dashboard" ? " s-card dash-lift" : ""}`} aria-label="Filming">
      {where === "dashboard" && <h2 className="film-title">Filming</h2>}
      {v.line && (
        <div className="film-head">
          <Sio size={48} shadow={false} expression={today ? "happy" : "neutral"} />
          <p>{v.line}</p>
        </div>
      )}
      {sessions.map((s) => (
        <div key={s.date} className="film-session">
          <div className="film-when">
            <b>{long(s.date)}{s.date === v.today ? ", today" : ""}</b>
            <small>{filmTime(s.used)} of your {filmTime(s.minutes)} planned</small>
          </div>
          <ol>
            {s.items.map((it) => (
              <li key={it.key}>
                <b>{it.title}</b>
                <small>{it.format}, goes out {weekday(it.publish)}</small>
                {it.hook && <span>Opens with: {it.hook}</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {unplaced.length > 0 && (
        <div className="film-session">
          <div className="film-when"><b>Not in a session</b></div>
          <ul>
            {unplaced.map((u) => <li key={`${u.title}-${u.publish}`}><b>{u.title}</b><small>{u.why}</small></li>)}
          </ul>
        </div>
      )}
      {where === "plan" && (
        <p className="film-note">
          Posts of the same kind are listed together, so the set-up changes as little as possible. SOCIA allows about {FILM_MINUTES.video} minutes to film a video and {FILM_MINUTES.still} for a photo or carousel: a planning allowance, not a measurement.{left ? ` Not listed: ${left}.` : ""} Nothing on your Calendar is moved.
        </p>
      )}
      {today && (
        <p className="film-after">
          After filming: <Link href="/studio" className="s-link">edit in Content Studio</Link>, <Link href="/clipper" className="s-link">cut a long take in the Clipper</Link>, or <Link href="/create" className="s-link">schedule a finished post</Link>.
        </p>
      )}
      {where === "dashboard" && <p className="film-after"><Link href="/plan" className="s-link">See the whole week on your Content Plan</Link></p>}
    </section>
  );
}
