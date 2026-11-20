// Every package under packages/ ships under one tag, so they share a version.
// With a tag (v0.2.0), the version must match it too.
//
//   bun scripts/check-versions.ts [v0.2.0]
import { readdir } from "node:fs/promises";

const repo = new URL("../", import.meta.url);

export async function packageVersions() {
  const found: { name: string; version: string }[] = [];
  for (const dir of await readdir(new URL("packages/", repo))) {
    const file = Bun.file(new URL(`packages/${dir}/package.json`, repo));
    if (await file.exists()) found.push(await file.json());
  }
  return found.map(({ name, version }) => ({ name, version }));
}

if (import.meta.main) {
  const tag = process.argv[2];
  const packages = await packageVersions();
  const versions = new Set(packages.map((p) => p.version));
  for (const p of packages) console.log(`${p.name}@${p.version}`);
  if (versions.size !== 1) {
    console.error("::error::packages/* must share one version");
    process.exit(1);
  }
  const [version] = versions;
  if (tag && tag !== `v${version}`) {
    console.error(`::error::Tag ${tag} does not match version ${version}`);
    process.exit(1);
  }
}
