/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Serve the static landing-page design at "/".
  // (The app itself lives at /login, /signup, /dashboard, /tool, etc.)
  async rewrites() {
    return [{ source: "/", destination: "/landing/index.html" }];
  },
};

export default nextConfig;
