/**
 * Identifies the deployment this code was built for. next.config.ts bakes NEXT_PUBLIC_BUILD_ID in at build time (the
 * Vercel deployment id), so the page in a phone and /api/version of the server agree exactly when they are the same build.
 * It is "dev" locally, where the update banner never shows.
 */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
