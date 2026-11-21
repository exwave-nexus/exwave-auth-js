// Writes <package>/publish/, the directory that goes to the registry: the
// files a package lists (default dist/), its README (or the repo's),
// LICENSE, and a package.json whose exports and bins point at dist/. The
// workspace manifest stays private and keeps pointing at src/, so the
// examples and tests run on the sources. Build the package first.
//
//   bun scripts/stage.ts packages/auth
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Public on npm: scoped packages would otherwise default to private, which
// a free npm org can't publish.
const REGISTRY = "https://registry.npmjs.org";

type Manifest = Record<string, unknown> & {
  name: string;
  version: string;
  exports?: Record<string, string>;
  bin?: Record<string, string>;
  files?: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const repo = new URL("../", import.meta.url);

/** Every workspace package's version, by name, for `workspace:*` ranges. */
async function workspaceVersions(): Promise<Map<string, string>> {
  const versions = new Map<string, string>();
  for (const name of await readdir(new URL("packages/", repo))) {
    const file = Bun.file(new URL(`packages/${name}/package.json`, repo));
    if (!(await file.exists())) continue;
    const manifest = (await file.json()) as Manifest;
    versions.set(manifest.name, manifest.version);
  }
  return versions;
}

function pinWorkspace(
  ranges: Record<string, string> | undefined,
  versions: Map<string, string>,
) {
  if (!ranges) return undefined;
  return Object.fromEntries(
    Object.entries(ranges).map(([name, range]) => {
      if (!range.startsWith("workspace:")) return [name, range];
      const version = versions.get(name);
      if (!version) throw new Error(`${name}: not a workspace package`);
      return [name, version];
    }),
  );
}

const built = (path: string) => {
  const match = /^\.\/src\/(.+)\.tsx?$/.exec(path);
  return match ? `./dist/${match[1]}` : null;
};

export async function stage(dir: URL) {
  const source = (await Bun.file(
    new URL("package.json", dir),
  ).json()) as Manifest;
  const out = new URL("./publish/", dir);
  const versions = await workspaceVersions();

  const exists = async (path: string) => {
    if (!(await Bun.file(new URL(path, dir)).exists()))
      throw new Error(`${source.name}: ${path} is missing, build it first`);
  };

  const exports: Record<string, string | { types: string; default: string }> =
    {};
  for (const [entry, path] of Object.entries(source.exports ?? {})) {
    const base = built(path);
    if (!base) {
      // Not TypeScript (a stylesheet, say): published as is.
      await exists(path);
      exports[entry] = path;
      continue;
    }
    await exists(`${base}.js`);
    await exists(`${base}.d.ts`);
    exports[entry] = { types: `${base}.d.ts`, default: `${base}.js` };
  }

  let bin: Record<string, string> | undefined;
  if (source.bin) {
    bin = {};
    for (const [name, path] of Object.entries(source.bin)) {
      const base = built(path);
      if (!base) throw new Error(`bin["${name}"]: unexpected path ${path}`);
      await exists(`${base}.js`);
      // npm wants bin paths without the leading "./" that exports need.
      bin[name] = `${base.slice(2)}.js`;
    }
  }

  const manifest = {
    name: source.name,
    version: source.version,
    description: source.description,
    license: source.license,
    repository: source.repository,
    type: source.type,
    sideEffects: source.sideEffects,
    exports: source.exports ? exports : undefined,
    bin,
    dependencies: pinWorkspace(source.dependencies, versions),
    peerDependencies: pinWorkspace(source.peerDependencies, versions),
    peerDependenciesMeta: source.peerDependenciesMeta,
    engines: source.engines,
    publishConfig: { registry: REGISTRY, access: "public" },
  };

  await rm(out, { recursive: true, force: true });
  await mkdir(out);
  for (const path of source.files ?? ["dist"])
    await cp(new URL(path, dir), new URL(path, out), { recursive: true });
  const readme = Bun.file(new URL("README.md", dir));
  await cp(
    (await readme.exists())
      ? new URL("README.md", dir)
      : new URL("README.md", repo),
    new URL("README.md", out),
  );
  await cp(new URL("LICENSE", repo), new URL("LICENSE", out));
  await Bun.write(
    new URL("package.json", out),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`${source.name}@${source.version} → ${out.pathname}`);
}

if (import.meta.main) {
  const target = process.argv[2];
  if (!target) throw new Error("usage: bun scripts/stage.ts <package dir>");
  await stage(pathToFileURL(`${resolve(target)}/`));
}
