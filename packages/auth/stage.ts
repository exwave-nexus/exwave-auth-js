// Writes publish/, the directory that goes to the registry: dist/, README.md,
// LICENSE and a package.json whose exports point at dist/. This package.json
// stays private and keeps exporting src/, so the examples and tests run on the
// sources. Run `bun build.ts` first (`bun run stage` does both).
import { cp, mkdir, rm } from "node:fs/promises";

const REGISTRY = "https://npm.pkg.github.com";

const root = new URL("./", import.meta.url);
const out = new URL("./publish/", root);
const source = await Bun.file(new URL("package.json", root)).json();

const exports: Record<string, { types: string; default: string }> = {};
for (const [entry, path] of Object.entries<string>(source.exports)) {
  const match = /^\.\/src\/(.+)\.tsx?$/.exec(path);
  if (!match) throw new Error(`exports["${entry}"]: unexpected path ${path}`);
  const built = `./dist/${match[1]}`;
  for (const file of [`${built}.js`, `${built}.d.ts`])
    if (!(await Bun.file(new URL(file, root)).exists()))
      throw new Error(`${file} is missing: run bun build.ts first`);
  exports[entry] = { types: `${built}.d.ts`, default: `${built}.js` };
}

const manifest = {
  name: source.name,
  version: source.version,
  description: source.description,
  license: source.license,
  repository: source.repository,
  type: source.type,
  sideEffects: source.sideEffects,
  exports,
  dependencies: source.dependencies,
  peerDependencies: source.peerDependencies,
  peerDependenciesMeta: source.peerDependenciesMeta,
  publishConfig: { registry: REGISTRY },
};

await rm(out, { recursive: true, force: true });
await mkdir(out);
await cp(new URL("dist/", root), new URL("dist/", out), { recursive: true });
await cp(new URL("README.md", root), new URL("README.md", out));
await cp(new URL("../../LICENSE", root), new URL("LICENSE", out));
await Bun.write(
  new URL("package.json", out),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`publish/: ${manifest.name}@${manifest.version}`);
