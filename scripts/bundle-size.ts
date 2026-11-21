// Measures what the core costs a browser app: one client factory from
// `@exwave-nexus/auth`, tree-shaken, bundled for the browser, minified, then
// gzipped at level 9. An app pays for the client it imports, not both.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

export const CORE_BUDGET_BYTES = 6 * 1024;

const core = new URL("../packages/auth/src/index.ts", import.meta.url).pathname;

/** What `import { <names> } from "@exwave-nexus/auth"` adds to an app. */
export async function measureImport(names: string[]) {
  const dir = await mkdtemp(join(tmpdir(), "exwave-size-"));
  try {
    const entry = join(dir, "entry.ts");
    await writeFile(
      entry,
      `export { ${names.join(", ")} } from ${JSON.stringify(core)};\n`,
    );
    const result = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      format: "esm",
      minify: true,
    });
    if (!result.success)
      throw new AggregateError(result.logs, "core build failed");
    const [output] = result.outputs;
    if (!output) throw new Error("core build produced nothing");
    const code = Buffer.from(await output.arrayBuffer());
    return {
      minified: code.length,
      gzipped: gzipSync(code, { level: 9 }).length,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const MEASURED = {
  "browser client": ["createExwaveAuth"],
  "route client": ["createExwaveRouteClient"],
};

if (import.meta.main) {
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(2)} KB`;
  let over = false;
  for (const [label, names] of Object.entries(MEASURED)) {
    const size = await measureImport(names);
    console.log(
      `@exwave-nexus/auth ${label}: ${kb(size.minified)} min, ${kb(size.gzipped)} min+gz (${size.gzipped} B; budget ${kb(CORE_BUDGET_BYTES)})`,
    );
    over ||= size.gzipped > CORE_BUDGET_BYTES;
  }
  if (over) process.exit(1);
}
