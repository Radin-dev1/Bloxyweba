import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The download route reads the plugin source at runtime; make sure it ships with the function.
  outputFileTracingIncludes: {
    "/api/plugin/download": ["./plugin/Bloxy.server.lua"],
    "/api/gen/model3d": ["./data/3dcode/index.json"],
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
