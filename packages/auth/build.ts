// Bundles each entry to dist/ (ESM, dependencies left external) and emits
// type declarations. The workspace's exports point at src/; the published
// manifest (stage.ts) points at dist/.
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";

const dist = new URL("./dist/", import.meta.url);
await rm(dist, { recursive: true, force: true });

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
  // Makes Bun emit react/jsx-runtime: the dev runtime's jsxDEV is undefined
  // in production apps (Bun ignores `jsx.development`). The library reads no
  // NODE_ENV itself; it would be inlined as "production" if it did.
  define: { "process.env.NODE_ENV": '"production"' },
  external: ["jose", "next", "next/*", "react", "react/*", "react-dom"],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

for (const output of result.outputs)
  if ((await output.text()).includes("react/jsx-dev-runtime"))
    throw new Error(`${output.path} imports react/jsx-dev-runtime`);

// Bun leaves "use client" below the hoisted imports, where Next.js ignores
// it. Move it to the first line and shift the source map down one line.
const reactEntry = Bun.file(new URL("react/index.js", dist));
const reactCode = await reactEntry.text();
const directive = '"use client";\n';
if (!reactCode.includes(directive))
  throw new Error('dist/react/index.js lost its "use client" directive');
await Bun.write(reactEntry, directive + reactCode.replace(directive, ""));
const reactMap = Bun.file(new URL("react/index.js.map", dist));
const map = await reactMap.json();
map.mappings = `;${map.mappings}`;
await Bun.write(reactMap, JSON.stringify(map));

const tsc = Bun.spawnSync(["bunx", "tsc", "-p", "tsconfig.build.json"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (tsc.exitCode !== 0) process.exit(tsc.exitCode ?? 1);

// Node's ESM resolution (TypeScript's `nodenext`) needs file extensions on
// relative imports and resolves no directories: `from "../client"` becomes
// `from "../client.js"`, and `import("..")` becomes `import("../index.js")`.
const relativeImport = /(from |import\()"(\.{1,2}(?:\/[^"]*)?)"/g;
for (const path of await readdir(dist, { recursive: true })) {
  if (!path.endsWith(".d.ts")) continue;
  const url = new URL(path, dist);
  const declarations = await Bun.file(url).text();
  const targets = new Map<string, string>();
  for (const [, , specifier] of declarations.matchAll(relativeImport)) {
    if (!specifier || targets.has(specifier) || specifier.endsWith(".js"))
      continue;
    const base = specifier.replace(/\/$/, "");
    const candidates = /^\.{1,2}$/.test(base)
      ? [`${base}/index.js`]
      : [`${base}.js`, `${base}/index.js`];
    const found = candidates.find((candidate) =>
      existsSync(new URL(candidate.replace(/\.js$/, ".d.ts"), url)),
    );
    if (!found) throw new Error(`${path}: cannot resolve "${specifier}"`);
    targets.set(specifier, found);
  }
  const rewritten = declarations.replace(
    relativeImport,
    (match, prefix: string, specifier: string) => {
      const target = targets.get(specifier);
      return target ? `${prefix}"${target}"` : match;
    },
  );
  if (rewritten !== declarations) await Bun.write(url, rewritten);
}

for (const output of result.outputs)
  console.log(`${output.path.split("/dist/")[1]}  ${output.size} B`);
