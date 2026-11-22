// Bundles the provider, hooks and gates to dist/, with React and
// @exwave-nexus/auth left as dependencies, then type declarations. Build
// packages/auth first: the declarations point at its dist/.
import { buildLibrary } from "../../scripts/build-lib";

await buildLibrary({
  dir: new URL("./", import.meta.url),
  entrypoints: ["src/index.tsx"],
  external: [
    "react",
    "react/*",
    "react-dom",
    "@exwave-nexus/auth",
    "@exwave-nexus/auth/*",
  ],
  useClient: ["index.js"],
  forbid: { "index.js": ["next", "jose", "@exwave-nexus/auth/server"] },
});
