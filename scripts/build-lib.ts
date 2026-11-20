// Builds a workspace package to dist/: each entry bundled as ESM with its
// dependencies left external, then type declarations. The workspace's
// manifests point at src/; the published ones (stage.ts) point at dist/.
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";

export interface LibraryBuild {
  /** The package directory. */
  dir: URL;
  /** Entry files, relative to `dir`, under `src/`. */
  entrypoints: string[];
  /** Bare imports to leave out of the bundle (a trailing `/*` matches subpaths). */
  external: string[];
  target?: "browser" | "node";
  /** Outputs, relative to `dist/`, that must start with `"use client"`. */
  useClient?: string[];
  /**
   * Bare imports an output (relative to `dist/`) may never reach, through the
   * chunks it imports too. Keeps React and Next.js out of the core.
   */
  forbid?: Record<string, string[]>;
  /** Prepended to these outputs, such as a shebang for a bin. */
  banner?: Record<string, string>;
  /** Emit `.d.ts` files with `tsconfig.build.json`. Default `true`. */
  declarations?: boolean;
}

const importSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)"([^"]+)"/g;

/** The bare imports an output reaches, following its relative imports. */
async function bareImports(file: URL, seen = new Set<string>()) {
  const found = new Set<string>();
  if (seen.has(file.href)) return found;
  seen.add(file.href);
  const code = await Bun.file(file).text();
  for (const [, specifier] of code.matchAll(importSpecifier)) {
    if (!specifier) continue;
    if (specifier.startsWith(".")) {
      for (const bare of await bareImports(new URL(specifier, file), seen))
        found.add(bare);
    } else found.add(specifier);
  }
  return found;
}

const matches = (specifier: string, pattern: string) =>
  specifier === pattern || specifier.startsWith(`${pattern}/`);

export async function buildLibrary(options: LibraryBuild) {
  const dist = new URL("./dist/", options.dir);
  await rm(dist, { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: options.entrypoints.map(
      (entry) => new URL(entry, options.dir).pathname,
    ),
    root: new URL("./src/", options.dir).pathname,
    outdir: dist.pathname,
    format: "esm",
    target: options.target ?? "browser",
    splitting: true,
    sourcemap: "linked",
    // Makes Bun emit react/jsx-runtime: the dev runtime's jsxDEV is undefined
    // in production apps (Bun ignores `jsx.development`). The libraries read
    // no NODE_ENV themselves; it would be inlined as "production" if they did.
    define: { "process.env.NODE_ENV": '"production"' },
    external: options.external,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  for (const output of result.outputs)
    if ((await output.text()).includes("react/jsx-dev-runtime"))
      throw new Error(`${output.path} imports react/jsx-dev-runtime`);

  for (const [path, forbidden] of Object.entries(options.forbid ?? {})) {
    const reached = await bareImports(new URL(path, dist));
    const leaks = [...reached].filter((specifier) =>
      forbidden.some((pattern) => matches(specifier, pattern)),
    );
    if (leaks.length)
      throw new Error(`dist/${path} must not import ${leaks.join(", ")}`);
  }

  // Bun leaves "use client" below the hoisted imports, where Next.js ignores
  // it, or drops it when the module's code moved to a shared chunk. Put it on
  // the first line and shift the source map down one line.
  const directive = '"use client";\n';
  for (const path of options.useClient ?? []) {
    const entry = Bun.file(new URL(path, dist));
    const code = await entry.text();
    await Bun.write(entry, directive + code.replace(directive, ""));
    await shiftSourceMap(new URL(`${path}.map`, dist), 1);
  }

  for (const [path, banner] of Object.entries(options.banner ?? {})) {
    const entry = Bun.file(new URL(path, dist));
    await Bun.write(entry, `${banner}\n${await entry.text()}`);
    await shiftSourceMap(
      new URL(`${path}.map`, dist),
      banner.split("\n").length,
    );
  }

  if (options.declarations !== false) {
    const tsc = Bun.spawnSync(["bunx", "tsc", "-p", "tsconfig.build.json"], {
      cwd: options.dir.pathname,
      stdout: "inherit",
      stderr: "inherit",
    });
    if (tsc.exitCode !== 0) process.exit(tsc.exitCode ?? 1);
    await addDeclarationExtensions(dist);
  }

  for (const output of result.outputs)
    console.log(`${output.path.split("/dist/")[1]}  ${output.size} B`);
}

async function shiftSourceMap(url: URL, lines: number) {
  const file = Bun.file(url);
  if (!(await file.exists())) return;
  const map = await file.json();
  map.mappings = ";".repeat(lines) + map.mappings;
  await Bun.write(file, JSON.stringify(map));
}

// Node's ESM resolution (TypeScript's `nodenext`) needs file extensions on
// relative imports and resolves no directories: `from "../client"` becomes
// `from "../client.js"`, and `import("..")` becomes `import("../index.js")`.
async function addDeclarationExtensions(dist: URL) {
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
}
