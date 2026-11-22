// Files the templates share, kept once and copied in (npm create copies a
// template into new apps, so the files have to be there, not imported):
//
// - packages/create/shared/: the plain templates' auth screens, stylesheet
//   and logo, for `next` and `vite`.
// - registry/: everything `next-shadcn` is made of besides its config. It is
//   the registry's exwave-app item (`npx shadcn create … exwave-app.json`),
//   ready to run, so the two stay the same app.
//
//   bun scripts/templates.ts sync    # copy the sources into the templates
//   bun scripts/templates.ts check   # fail when a template's copy differs
import { readdir, rm } from "node:fs/promises";

const repo = new URL("../", import.meta.url);
const SHARED = "packages/create/shared/";
const NEXT = "packages/create/templates/next/";
const VITE = "packages/create/templates/vite/";
const SHADCN = "packages/create/templates/next-shadcn/";
const AUTH_PAGES = [
  "sign-in",
  "sign-up",
  "verify",
  "forgot-password",
  "reset-password",
];

/**
 * Each source file or folder (from the repository root), and where the
 * templates keep it. A folder's copy holds nothing else but the files other
 * entries copy into it.
 */
const COPIES: [from: string, to: string[]][] = [
  [
    `${SHARED}components/exwave/`,
    [`${NEXT}components/exwave/`, `${VITE}src/components/exwave/`],
  ],
  [`${SHARED}styles.css`, [`${NEXT}app/globals.css`, `${VITE}src/index.css`]],
  [
    `${SHARED}exwave.svg`,
    [
      `${NEXT}public/exwave.svg`,
      `${NEXT}app/icon.svg`,
      `${VITE}public/exwave.svg`,
      `${SHADCN}public/exwave.svg`,
      `${SHADCN}app/icon.svg`,
    ],
  ],
  ["registry/exwave/", [`${SHADCN}components/exwave/`]],
  ["registry/ui/", [`${SHADCN}components/ui/`]],
  ["registry/lib/utils.ts", [`${SHADCN}lib/utils.ts`]],
  ...AUTH_PAGES.map((page): [string, string[]] => [
    `registry/next/app/(auth)/${page}/page.tsx`,
    [`${SHADCN}app/(auth)/${page}/page.tsx`],
  ]),
  [
    "registry/next/app/api/exwave/[...action]/route.ts",
    [`${SHADCN}app/api/exwave/[...action]/route.ts`],
  ],
  ["registry/next/lib/exwave.ts", [`${SHADCN}lib/exwave.ts`]],
  ["registry/next/proxy.ts", [`${SHADCN}proxy.ts`]],
  ...[
    "app/globals.css",
    "app/layout.tsx",
    "app/page.tsx",
    "app/account/page.tsx",
    "app/(auth)/layout.tsx",
    "components/theme-provider.tsx",
    "components/exwave/backend-notice.tsx",
    "lib/local-mock.ts",
  ].map((path): [string, string[]] => [
    `registry/next-app/${path}`,
    [`${SHADCN}${path}`],
  ]),
];

async function files(dir: string): Promise<string[]> {
  try {
    return (await readdir(new URL(dir, repo), { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/** The copies that differ from their source, plus files a copied folder shouldn't hold. */
async function sync(write: boolean): Promise<string[]> {
  // Every target file, with its source.
  const sources = new Map<string, string>();
  const folders = new Set<string>();
  for (const [from, targets] of COPIES)
    for (const to of targets) {
      if (!from.endsWith("/")) {
        sources.set(to, from);
        continue;
      }
      folders.add(to);
      for (const name of await files(from))
        sources.set(`${to}${name}`, `${from}${name}`);
    }

  const stale: string[] = [];
  for (const [to, from] of sources) {
    const source = await Bun.file(new URL(from, repo)).text();
    const target = Bun.file(new URL(to, repo));
    if ((await target.exists()) && (await target.text()) === source) continue;
    stale.push(to);
    if (write) await Bun.write(target, source);
  }
  for (const folder of folders)
    for (const name of await files(folder)) {
      if (sources.has(`${folder}${name}`)) continue;
      stale.push(`${folder}${name}`);
      if (write) await rm(new URL(`${folder}${name}`, repo));
    }
  return stale;
}

const command = process.argv[2];
if (command === "sync") {
  for (const path of await sync(true)) console.log(`updated ${path}`);
} else if (command === "check") {
  const stale = await sync(false);
  if (stale.length) {
    console.error(
      `These differ from their source in ${SHARED} or registry/ (edit them there, then bun run templates:sync):\n  ${stale.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log("The templates match packages/create/shared/ and registry/.");
} else {
  console.error("usage: bun scripts/templates.ts sync | check");
  process.exit(1);
}
