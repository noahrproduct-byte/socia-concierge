// "Remember me" on the login page. Ticked (the default): the session lasts as
// Supabase keeps it. Unticked: the session ends when the browser closes. Two
// cookies carry it: socia_forget (kept) says this browser asked not to be
// remembered, socia_alive (a session cookie, gone when the browser closes)
// says this browser session is the one that signed in. The middleware signs
// the person out when the first is there without the second.
export const FORGET_COOKIE = "socia_forget";
export const ALIVE_COOKIE = "socia_alive";

/** Signed in, asked not to be remembered, and the browser has closed since. Pure. */
export function shouldForget(cookies: { forget?: string | null; alive?: string | null }): boolean {
  return cookies.forget === "1" && cookies.alive !== "1";
}

/** Browser only: record the choice just before signing in (any method). */
export function applyRemember(remember: boolean): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; secure" : "";
  if (remember) {
    document.cookie = `${FORGET_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
    document.cookie = `${ALIVE_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
    return;
  }
  document.cookie = `${FORGET_COOKIE}=1; path=/; max-age=31536000; samesite=lax${secure}`;
  // No max-age: the browser drops it when it closes.
  document.cookie = `${ALIVE_COOKIE}=1; path=/; samesite=lax${secure}`;
}
