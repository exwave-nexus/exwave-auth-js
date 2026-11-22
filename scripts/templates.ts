// The templates share their auth screens, stylesheet and logo: one copy in
// packages/create/shared/, copied into each template (which npm create copies
// into new apps, so the files have to be there, not imported).
//
//   bun scripts/templates.ts sync    # copy shared/ into the templates
//   bun scripts/templates.ts check   # fail when a template's copy differs
import { readdir, rm } from "node:fs/promises";

const repo = new URL("../", import.meta.url);
const SHARED = "packages/create/shared/";
const NEXT = "packages/create/templates/next/";
const VITE = "packages/create/templates/vite/";

/** Each shared file or folder, and where the templates keep it. */
const COPIES: [from: string, to: string[]][] = [
  [
    "components/exwave/",
    [`${NEXT}components/exwave/`, `${VITE}src/components/exwave/`],
  ],
  ["styles.css", [`${NEXT}app/globals.css`, `${VITE}src/index.css`]],
  [
    "exwave.svg",
    [
      `${NEXT}public/exwave.svg`,
      `${NEXT}app/icon.svg`,
      `${VITE}public/exwave.svg`,
    ],
  ],
];

async function files(dir: string): Promise<string[]> {
  try {
    return (await readdir(new URL(dir, repo))).sort();
  } catch {
    return [];
  }
}

/** The copies that differ from shared/, plus files a shared folder no longer has. */
async function sync(write: boolean): Promise<string[]> {
  const stale: string[] = [];
  const copy = async (from: string, to: string) => {
    const source = await Bun.file(new URL(`${SHARED}${from}`, repo)).text();
    const target = Bun.file(new URL(to, repo));
    if ((await target.exists()) && (await target.text()) === source) return;
    stale.push(to);
    if (write) await Bun.write(target, source);
  };
  for (const [from, targets] of COPIES)
    for (const to of targets) {
      if (!from.endsWith("/")) {
        await copy(from, to);
        continue;
      }
      const names = await files(`${SHARED}${from}`);
      for (const name of names) await copy(`${from}${name}`, `${to}${name}`);
      for (const extra of await files(to)) {
        if (names.includes(extra)) continue;
        stale.push(`${to}${extra}`);
        if (write) await rm(new URL(`${to}${extra}`, repo));
      }
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
      `These differ from ${SHARED} (edit them there, then bun run templates:sync):\n  ${stale.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log(`The templates match ${SHARED}.`);
} else {
  console.error("usage: bun scripts/templates.ts sync | check");
  process.exit(1);
}
