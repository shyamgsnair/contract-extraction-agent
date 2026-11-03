import type { NextConfig } from "next";

// Secrets live in the single .env at the repo root, shared with the CLI. Next.js only looks in this folder,
// so load the root file here. Variables already set in the environment win.
try {
  process.loadEnvFile("../../.env");
} catch {
  // No .env file: rely on the environment.
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The workspace packages ship TypeScript source, so Next.js compiles them along with the app.
  transpilePackages: ["@cea/agent", "@cea/db"],
  experimental: {
    // Contract PDFs can be up to 32 MB (Claude's limit); leave room for the upload's form encoding.
    serverActions: { bodySizeLimit: "33mb" },
    proxyClientMaxBodySize: "33mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
