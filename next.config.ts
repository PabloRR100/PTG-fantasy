import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
