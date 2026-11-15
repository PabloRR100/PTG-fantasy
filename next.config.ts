import type { NextConfig } from "next";

// The deployment id is baked into the client bundle and served by /api/version, so an open app can tell when it is stale.
const buildId = process.env.VERCEL_DEPLOYMENT_ID ?? "dev";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  images: {
    // Google avatars arrive as URLs from the OAuth profile.
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  async headers() {
    // A browser re-checks the service worker script on every visit; a stale cached copy would keep old push code alive.
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
};

export default nextConfig;
