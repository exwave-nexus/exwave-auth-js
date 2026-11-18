import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  // @exwave/auth ships TypeScript sources while it is private.
  transpilePackages: ["@exwave/auth"],
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
};

export default config;
