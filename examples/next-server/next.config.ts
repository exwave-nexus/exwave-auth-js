import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  // The workspace package exports its TypeScript sources.
  transpilePackages: ["@exwave-nexus/auth"],
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
};

export default config;
