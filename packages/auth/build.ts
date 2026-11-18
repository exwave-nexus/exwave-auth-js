// Bundles each entry to dist/ (ESM, dependencies left external) and emits
// type declarations. The package exports point at src/ while it is private.
import { rm } from "node:fs/promises";

await rm(new URL("./dist", import.meta.url), { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [
    "src/index.ts",
    "src/server/index.ts",
    "src/next/index.ts",
    "src/react/index.tsx",
  ],
  root: "src",
  outdir: "dist",
  format: "esm",
  target: "browser",
  splitting: true,
  sourcemap: "linked",
  external: ["jose", "next", "next/*", "react", "react/*", "react-dom"],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const tsc = Bun.spawnSync(["bunx", "tsc", "-p", "tsconfig.build.json"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (tsc.exitCode !== 0) process.exit(tsc.exitCode ?? 1);

for (const output of result.outputs)
  console.log(`${output.path.split("/dist/")[1]}  ${output.size} B`);
