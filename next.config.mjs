/** @type {import('next').NextConfig} */

// Content Security Policy.
// ENFORCED now: the directives nothing in the app conflicts with (no plugins,
// no <base>, no framing by other sites, forms post to SOCIA or, for the AI
// app consent, to the app's https/loopback redirect address).
// REPORT-ONLY for now: the full policy. Violations show in the browser
// console; once a week of normal use shows none, move it to the enforced
// header. 'unsafe-inline' is needed by Next's inline bootstrap scripts and
// the theme script; 'wasm-unsafe-eval' and blob: by the in-browser video
// tools (ffmpeg.wasm, Remotion, Mediabunny workers).
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "https://*.supabase.co";
  }
})();
const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");

const enforcedCsp = [
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self' https: http://localhost:* http://127.0.0.1:*",
].join("; ");

const reportOnlyCsp = [
  "default-src 'self'",
  // The dev server evaluates code strings (fast refresh); production never does.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  `media-src 'self' blob: data: ${supabaseOrigin} https://*.cdninstagram.com https://*.fbcdn.net`,
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs} https://fonts.gstatic.com https://*.cdninstagram.com https://*.fbcdn.net blob: data:`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self' https: http://localhost:* http://127.0.0.1:*",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  // No "X-Powered-By: Next.js": nothing to fingerprint.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: enforcedCsp },
          { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
        ],
      },
    ];
  },
};

export default nextConfig;
