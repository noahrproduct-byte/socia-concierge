"use client";

// The moment SOCIA finishes reading a newly connected account (onboarding).
// One orchestrated reveal of what it actually measured, never a progress show:
// a scale sweeps across and each tick that lights is one post SOCIA read,
// grouped by format; the follower count rises into place (the final number
// from the first frame, masked, never counted up); the measured facts land on
// the scale; the niche SOCIA inferred wipes in. Everything is in the DOM at
// once for screen readers, and with reduced motion it is simply there.

import { ArrowRight } from "lucide-react";
import type { Understanding } from "@/lib/intel/understanding";
import { GOAL_PLATFORM_NAME } from "@/lib/growth";
import { ticksFor } from "@/lib/readReveal";


/** The account with the most followers leads; the others are listed under it. */
function lead(u: Understanding) {
  return [...u.facts].sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1))[0] ?? null;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export default function ReadReveal({ understanding: u, onContinue }: { understanding: Understanding; onContinue: () => void }) {
  const f = lead(u);
  if (!f) return null;
  const hero = f.followers != null ? { value: f.followers.toLocaleString("en-US"), label: `followers on ${GOAL_PLATFORM_NAME[f.platform]}` } : { value: f.postsSampled.toLocaleString("en-US"), label: `posts read on ${GOAL_PLATFORM_NAME[f.platform]}` };
  const groups = ticksFor(f.formats, f.postsSampled);
  const facts = [
    plural(f.postsSampled, "recent post read", "recent posts read"),
    f.postsPerWeek != null ? `${f.postsPerWeek} a week lately` : null,
    f.formats[0] ? `mostly ${f.formats[0].format.toLowerCase()}s` : null,
  ].filter((x): x is string => Boolean(x));
  const niche = u.niche ? [u.niche.value.specific, u.niche.value.subcategory, u.niche.value.category].find(Boolean) ?? null : null;
  const place = u.geography?.value.place ?? null;
  const others = u.facts.filter((x) => x !== f);
  let tick = 0;

  return (
    <div className="ob-stage rv" role="status" aria-live="polite">
      <h1 className="rv-who" tabIndex={-1}><span className="sr-only">SOCIA read </span>{f.handle ?? GOAL_PLATFORM_NAME[f.platform]}</h1>
      <p className="rv-hero" aria-label={`${hero.value} ${hero.label}`}>
        <span className="rv-num" aria-hidden>
          {hero.value.split("").map((ch, i) => (
            <span className="rv-digit" key={i} style={{ ["--i" as string]: i }}><span>{ch}</span></span>
          ))}
        </span>
        <span className="rv-unit" aria-hidden>{hero.label}</span>
      </p>

      <div className="rv-scale" aria-label={`${f.postsSampled} recent posts read${groups.length > 1 ? `: ${groups.map((g) => g.format.toLowerCase()).join(", ")}` : ""}`}>
        <i className="rv-sweep" aria-hidden />
        <div className="rv-ticks" aria-hidden style={{ ["--n" as string]: Math.max(1, groups.reduce((s, g) => s + g.ticks, 0)) }}>
          {groups.map((g, gi) => (
            <span className={`rv-group g${gi % 3}`} key={g.format} style={{ flexGrow: g.ticks }}>
              <span className="rv-group-ticks">
                {Array.from({ length: g.ticks }, () => {
                  const t = tick++;
                  return <i key={t} style={{ ["--t" as string]: t }} />;
                })}
              </span>
              <span className="rv-group-label">{g.format}</span>
            </span>
          ))}
        </div>
      </div>

      <ul className="rv-facts">
        {facts.map((x, i) => <li key={x} style={{ ["--i" as string]: i }}>{x}</li>)}
        {others.map((o, i) => (
          <li key={o.platform} style={{ ["--i" as string]: facts.length + i }}>
            {GOAL_PLATFORM_NAME[o.platform]}: {o.followers != null ? plural(o.followers, "follower", "followers") : plural(o.postsSampled, "post read", "posts read")}
          </li>
        ))}
      </ul>

      {niche && (
        <p className="rv-niche">
          <span>{niche}{place ? `, ${place}` : ""}</span>
        </p>
      )}

      {u.themes.length > 0 && (
        <ul className="rv-themes" aria-label="Recurring in your posts">
          {u.themes.slice(0, 4).map((t, i) => (
            <li key={t.name} style={{ ["--i" as string]: i }}><b>{t.name}</b> {plural(t.posts, "post", "posts")}</li>
          ))}
        </ul>
      )}

      <button type="button" className="ob-btn ob-btn-primary rv-go" onClick={onContinue} autoFocus>
        Check what SOCIA found <ArrowRight size={17} />
      </button>
    </div>
  );
}
