// Copies a template into a new directory and makes it the user's app: its
// name, exact versions of the Exwave packages, and a .env.local with the
// publishable key (or the local mock's) and, for Next.js, a cookie secret.
import { randomBytes } from "node:crypto";
import { cp, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { decodePublishableKey } from "@exwave-nexus/auth";
import type { Template } from "./args";

/** `bunx exwave-auth-mock`'s key: http://localhost:4010, its fixed platform. */
export const MOCK_KEY =
  "exw_pk_MXxodHRwOi8vbG9jYWxob3N0OjQwMTB8NmYxYzJhMTAtNWEzZS00YzJiLTlkNGUtMGExYjJjM2Q0ZTVm";

/** npm drops dotfiles like .gitignore from tarballs, so templates ship them renamed. */
const RENAMES: Record<string, string> = { _gitignore: ".gitignore" };

/** Never copied: build output, installs, local env files. */
const SKIP = [
  /^node_modules$/,
  /^\.next$/,
  /^dist$/,
  /^next-env\.d\.ts$/,
  /\.tsbuildinfo$/,
  /^\.env/,
];

export class ScaffoldError extends Error {}

export interface ScaffoldOptions {
  dir: string;
  template: Template;
  /** `null` uses the local mock. */
  key: string | null;
  /** This release's version: the Exwave packages are pinned to it. */
  version: string;
  templatesDir: string;
  /** @internal Package tarballs to install instead, for the smoke test. */
  tarballs?: Record<string, string>;
}

const ENV_NAMES: Record<Template, string> = {
  next: "NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY",
  vite: "VITE_EXWAVE_PUBLISHABLE_KEY",
};

/** Throws a ScaffoldError explaining what is wrong with a key. */
export function checkKey(key: string) {
  try {
    decodePublishableKey(key);
  } catch {
    throw new ScaffoldError(
      `"${key}" is not a publishable key. Copy it from Nexus → Auth: it starts with exw_pk_.`,
    );
  }
}

/** A package name from a directory name. */
export function packageName(dir: string): string {
  const name = basename(resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^[._-]+|-+$/g, "");
  return name || "exwave-app";
}

async function isEmpty(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.every((entry) => entry === ".git" || entry === ".DS_Store");
  } catch {
    return true;
  }
}

function envFile(template: Template, key: string | null): string {
  const lines = [
    key
      ? "# From Nexus → Auth. It holds no secret."
      : "# The local mock (npm run mock). Put your key from Nexus → Auth here once you have one.",
    `${ENV_NAMES[template]}=${key ?? MOCK_KEY}`,
  ];
  if (template === "next")
    lines.push(
      "",
      "# Seals the session cookie. Keep it secret; use another one in production.",
      `EXWAVE_COOKIE_SECRET=${randomBytes(32).toString("base64url")}`,
    );
  return `${lines.join("\n")}\n`;
}

export async function scaffold(options: ScaffoldOptions) {
  const target = resolve(options.dir);
  if (!(await isEmpty(target)))
    throw new ScaffoldError(
      `${options.dir} isn't empty. Pick a new directory.`,
    );
  if (options.key) checkKey(options.key);

  const source = join(options.templatesDir, options.template);
  await cp(source, target, {
    recursive: true,
    filter: (path) => !SKIP.some((pattern) => pattern.test(basename(path))),
  });
  for (const [from, to] of Object.entries(RENAMES))
    await rename(join(target, from), join(target, to)).catch(() => undefined);

  const version = (name: string) =>
    options.tarballs?.[name]
      ? `file:${options.tarballs[name]}`
      : options.version;
  const manifestPath = join(target, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.name = packageName(target);
  for (const field of ["dependencies", "devDependencies"])
    for (const [name, range] of Object.entries<string>(manifest[field] ?? {}))
      if (range.startsWith("workspace:")) manifest[field][name] = version(name);
  if (!options.key) {
    manifest.scripts = { ...manifest.scripts, mock: "exwave-auth-mock" };
    manifest.devDependencies = {
      ...manifest.devDependencies,
      "@exwave-nexus/auth-mock": version("@exwave-nexus/auth-mock"),
    };
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    join(target, ".env.local"),
    envFile(options.template, options.key),
  );

  return { target, name: manifest.name as string, usesMock: !options.key };
}
