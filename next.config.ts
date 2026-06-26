import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder (a stray lockfile exists one level up).
  // turbopack.root only applies to Turbopack; outputFileTracingRoot pins it for
  // the webpack dev server too, which is what `next dev` uses without --turbopack.
  // Without this, Next infers the root as the parent iORA dir and the CSS loader
  // fails to resolve `tailwindcss` there, spamming resolve errors on every compile.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
