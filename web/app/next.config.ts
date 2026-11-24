import type { NextConfig } from "next";

// The packaged build (scripts/build-release.mjs) needs `standalone`: Next then
// emits .next/standalone with a pruned node_modules and its own server.js, so
// the release folder carries no 200 MB node_modules. Dev mode is unaffected.
const nextConfig: Partial<NextConfig> = {
  output: process.env.UNPHASED_STANDALONE ? "standalone" : undefined,
};

export default nextConfig;
