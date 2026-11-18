// Measures what the core costs a browser app: `@exwave/auth` (the "." entry),
// bundled for the browser, minified, then gzipped at level 9.
import { gzipSync } from "node:zlib";

export const CORE_BUDGET_BYTES = 6 * 1024;

export async function measureCore() {
  const result = await Bun.build({
    entrypoints: [
      new URL("../packages/auth/src/index.ts", import.meta.url).pathname,
    ],
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
}

if (import.meta.main) {
  const size = await measureCore();
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(2)} KB`;
  console.log(
    `@exwave/auth core: ${kb(size.minified)} min, ${kb(size.gzipped)} min+gz (${size.gzipped} B; budget ${kb(CORE_BUDGET_BYTES)})`,
  );
  if (size.gzipped > CORE_BUDGET_BYTES) process.exit(1);
}
