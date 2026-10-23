// The OAuth `state` check for social connect flows (Instagram, Facebook;
// YouTube and TikTok keep their own equivalent). The start route makes a
// random nonce, keeps it in an HttpOnly cookie and sends `<nonce>.<dest>` as
// state; the callback refuses any code whose state does not match the
// cookie. Without it, an attacker could send a signed-in person to the
// callback with the attacker's own authorization code and attach the
// attacker's account to the victim's workspace (OAuth account injection).
//
// Server only.

import { timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

export const OAUTH_STATE_MAX_AGE = 600;
export const IG_STATE_COOKIE = "ig_oauth_state";
export const FB_STATE_COOKIE = "fb_oauth_state";

export type ConnectDest = "settings" | "onboarding";
const asDest = (v: string | null | undefined): ConnectDest => (v === "onboarding" ? "onboarding" : "settings");

/** A fresh state value for the provider, and the nonce to keep in the cookie. */
export function newOAuthState(dest: ConnectDest): { state: string; nonce: string } {
  const nonce = crypto.randomUUID();
  return { state: `${nonce}.${dest}`, nonce };
}

export function setStateCookie(res: NextResponse, cookie: string, nonce: string): void {
  res.cookies.set(cookie, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: OAUTH_STATE_MAX_AGE });
}

export function clearStateCookie(res: NextResponse, cookie: string): void {
  res.cookies.set(cookie, "", { path: "/", maxAge: 0 });
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Check the callback's state against the cookie. `dest` is always usable (it
 * only picks the landing page); `ok` is true only when the nonce matches.
 */
export function verifyOAuthState(req: Request, cookie: string): { ok: boolean; dest: ConnectDest } {
  const state = new URL(req.url).searchParams.get("state") ?? "";
  const dot = state.indexOf(".");
  const nonce = dot === -1 ? state : state.slice(0, dot);
  const dest = asDest(dot === -1 ? null : state.slice(dot + 1));
  const expected = readCookie(req, cookie);
  return { ok: Boolean(nonce && expected && nonce.length <= 100 && same(nonce, expected)), dest };
}
