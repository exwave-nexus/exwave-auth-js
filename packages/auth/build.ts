// Bundles each entry to dist/ and emits type declarations (scripts/build-lib.ts).
// The core runs in browsers, Bun and Node with no framework: React, Next.js
// and the other frameworks have their own packages. jose is for the server.
import { buildLibrary } from "../../scripts/build-lib";

const FRAMEWORKS = ["react", "react-dom", "next", "vue", "svelte"];

await buildLibrary({
  dir: new URL("./", import.meta.url),
  entrypoints: ["src/index.ts", "src/messages.ts", "src/server/index.ts"],
  external: ["jose"],
  forbid: {
    "index.js": [...FRAMEWORKS, "jose"],
    "messages.js": [...FRAMEWORKS, "jose"],
    "server/index.js": FRAMEWORKS,
  },
});
