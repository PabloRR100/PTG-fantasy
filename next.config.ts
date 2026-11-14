import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Google avatars arrive as URLs from the OAuth profile.
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};

export default nextConfig;
