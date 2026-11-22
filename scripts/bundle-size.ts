// Measures what the packages cost a browser app: one client factory from
// `@exwave-nexus/auth`, or all of `@exwave-nexus/auth-react`, tree-shaken,
// bundled for the browser, minified, then gzipped at level 9. An app pays for
// the client it imports, not both.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

export const CORE_BUDGET_BYTES = 6 * 1024;
/** `@exwave-nexus/auth-react`: provider, hooks and gates, plus the core they use. React itself is the app's. */
export const REACT_BUDGET_BYTES = 10 * 1024;

const src = (path: string) =>
  new URL(`../packages/${path}`, import.meta.url).pathname;

/** What `import { <names> }` from an entry (under packages/) adds to an app. */
export async function measureImport(
  names: string[],
  entry = "auth/src/index.ts",
) {
  const dir = await mkdtemp(join(tmpdir(), "exwave-size-"));
  try {
    const file = join(dir, "entry.ts");
    await writeFile(
      file,
      names[0] === "*"
        ? `export * from ${JSON.stringify(src(entry))};\n`
        : `export { ${names.join(", ")} } from ${JSON.stringify(src(entry))};\n`,
    );
    const result = await Bun.build({
      entrypoints: [file],
      target: "browser",
      format: "esm",
      minify: true,
      external: ["react", "react/*", "react-dom"],
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

export const MEASURED: Record<
  string,
  { names: string[]; entry?: string; budget: number }
> = {
  "@exwave-nexus/auth browser client": {
    names: ["createExwaveAuth"],
    budget: CORE_BUDGET_BYTES,
  },
  "@exwave-nexus/auth route client": {
    names: ["createExwaveRouteClient"],
    budget: CORE_BUDGET_BYTES,
  },
  "@exwave-nexus/auth-react": {
    names: ["*"],
    entry: "auth-react/src/index.tsx",
    budget: REACT_BUDGET_BYTES,
  },
};

if (import.meta.main) {
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(2)} KB`;
  let over = false;
  for (const [label, { names, entry, budget }] of Object.entries(MEASURED)) {
    const size = await measureImport(names, entry);
    console.log(
      `${label}: ${kb(size.minified)} min, ${kb(size.gzipped)} min+gz (${size.gzipped} B; budget ${kb(budget)})`,
    );
    over ||= size.gzipped > budget;
  }
  if (over) process.exit(1);
}
