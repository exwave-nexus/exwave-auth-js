// Bundles the mock and its CLI for Node (and Bun), with jose and
// @exwave-nexus/auth left as dependencies. Build packages/auth first: the
// declarations point at its dist/.
import { buildLibrary } from "../../scripts/build-lib";

await buildLibrary({
  dir: new URL("./", import.meta.url),
  entrypoints: ["src/index.ts", "src/cli.ts"],
  external: ["jose", "@exwave-nexus/auth"],
  target: "node",
  banner: { "cli.js": "#!/usr/bin/env node" },
});
