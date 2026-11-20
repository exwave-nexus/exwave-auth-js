// Bundles each entry to dist/ and emits type declarations (scripts/build-lib.ts).
// React, Next.js and jose stay out of the entries that must not need them.
import { buildLibrary } from "../../scripts/build-lib";

const FRAMEWORKS = ["react", "react-dom", "next"];

await buildLibrary({
  dir: new URL("./", import.meta.url),
  entrypoints: [
    "src/index.ts",
    "src/messages.ts",
    "src/react/index.tsx",
    "src/server/index.ts",
    "src/next/index.ts",
    "src/next/client.tsx",
  ],
  external: ["jose", "next", "next/*", "react", "react/*", "react-dom"],
  useClient: ["react/index.js", "next/client.js"],
  forbid: {
    "index.js": [...FRAMEWORKS, "jose"],
    "messages.js": [...FRAMEWORKS, "jose"],
    "react/index.js": ["next", "jose"],
    "server/index.js": FRAMEWORKS,
    "next/client.js": ["jose"],
  },
});
