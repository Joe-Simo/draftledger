import type { NextConfig } from "next";

// GitHub Pages serves a project site under /<repo>/. Set NEXT_PUBLIC_BASE_PATH (for example "/draftledger") at
// build time; leave it unset for local use and user or custom-domain sites.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
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
