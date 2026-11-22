// Bundles the CLI for Node (no dependencies: @exwave-nexus/auth's key check
// is bundled in), then copies the templates as git sees them, minus local env
// files, into dist/templates.
import { cp, mkdir, rm } from "node:fs/promises";
import { buildLibrary } from "../../scripts/build-lib";

const dir = new URL("./", import.meta.url);

await buildLibrary({
  dir,
  entrypoints: ["src/index.ts"],
  external: [],
  target: "node",
  banner: { "index.js": "#!/usr/bin/env node" },
  declarations: false,
});

// Tracked files plus new ones git doesn't ignore: never installs or builds.
const listed = Bun.spawnSync(
  [
    "git",
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "templates",
  ],
  { cwd: dir.pathname },
);
if (listed.exitCode !== 0) throw new Error("git ls-files templates failed");
const files: string[] = [];
for (const path of listed.stdout.toString().split("\n")) {
  if (!path || /(^|\/)\.env/.test(path)) continue;
  // Still in git's index, but deleted from the working tree.
  if (!(await Bun.file(new URL(path, dir)).exists())) continue;
  files.push(path);
}
await rm(new URL("dist/templates/", dir), { recursive: true, force: true });
for (const path of files) {
  const to = new URL(`dist/${path}`, dir);
  await mkdir(new URL("./", to), { recursive: true });
  await cp(new URL(path, dir), to);
}
console.log(`dist/templates: ${files.length} files`);
