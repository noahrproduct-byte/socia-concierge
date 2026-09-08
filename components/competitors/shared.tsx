"use client";

// Small pieces every Competitors section shares: number formatting, the
// typed-absence text for a Cell, platform marks and the avatar fallback.

import { CELL_REASON, type Cell } from "@/lib/competitorRollup";
import { CLASSIFICATION_LABEL, type Classification } from "@/lib/discovery";

export const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K"
  : Math.round(n).toLocaleString("en-US");

export const cellText = (c: Cell, fmt?: (n: number) => string): string =>
  c.state === "ok" && c.value != null ? (fmt ? fmt(c.value) : fmtN(c.value))
  : c.state === "unknown" ? "—" : CELL_REASON[c.state as Exclude<Cell["state"], "ok">];

export const platName = (p: string) => (p === "youtube" ? "YouTube" : p === "facebook" ? "Facebook" : p === "tiktok" ? "TikTok" : "Instagram");

export const classLabel = (c: string | null): string | null =>
  c ? (CLASSIFICATION_LABEL[c as Classification] ?? c) : null;

export const fmtDate = (iso: string | null, year = false) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }) : "—";

export function PlatformMark({ p, size = 12 }: { p: string; size?: number }) {
  if (p === "youtube") return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-label="YouTube"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1c.4-1.6.5-3.2.5-4.8s-.1-3.2-.5-4.8ZM9.7 15.1V8.9l6 3.1-6 3.1Z" /></svg>
  );
  if (p === "facebook") return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-label="Facebook"><path d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.2-1.3 1.3-1.3h1.4V5.9c-.2 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v1.9H8.5V14h2.3v7h2.7Z" /></svg>
  );
  if (p === "tiktok") return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-label="TikTok"><path d="M16.5 3c.3 2.2 1.6 3.6 3.8 3.8v3.1c-1.4 0-2.7-.4-3.8-1.2v6.2A5.7 5.7 0 1 1 10.8 9.2v3.2a2.6 2.6 0 1 0 2.6 2.6V3h3.1Z" /></svg>
  );
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" aria-label="Instagram"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
  );
}

export function Avatar({ src, name, size = 40, className = "" }: { src: string | null; name: string; size?: number; className?: string }) {
  const letter = (name.replace(/^@/, "")[0] ?? "?").toUpperCase();
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className={`cx-avatar ${className}`} src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className={`cx-avatar ph ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden>{letter}</span>;
}
