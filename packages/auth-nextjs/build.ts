// Bundles the server entry and the client provider to dist/, with Next.js,
// React and the other Exwave packages left as dependencies, then type
// declarations. Build packages/auth and packages/auth-react first: the
// declarations point at their dist/.
import { buildLibrary } from "../../scripts/build-lib";

await buildLibrary({
  dir: new URL("./", import.meta.url),
  entrypoints: ["src/index.ts", "src/client.tsx"],
  external: [
    "next",
    "next/*",
    "react",
    "react/*",
    "react-dom",
    "@exwave-nexus/auth",
    "@exwave-nexus/auth/*",
    "@exwave-nexus/auth-react",
  ],
  useClient: ["client.js"],
  // The provider ships to browsers: no server code.
  forbid: {
    "client.js": ["jose", "next/headers", "@exwave-nexus/auth/server"],
  },
});
