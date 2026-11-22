// Uses the packages the way a developer would, from the tarballs a release
// would publish: npm-installed into new apps, outside this workspace.
//
//   1. create-exwave makes every template; they install, typecheck and build.
//   2. The Next.js app signs in against the mock, through its own routes.
//   3. The core installs and signs in under Node without React or Next.js.
//   4. The registry's auth-nextjs block goes into a fresh shadcn app, and
//      `shadcn create` makes a new app from exwave-app; both typecheck and
//      build. (Skip with --no-registry.)
//
//   bun scripts/smoke.ts [--no-registry] [--only-registry] [--keep]
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = new URL("../", import.meta.url).pathname;
const flags = new Set(process.argv.slice(2));
const work = await mkdtemp(join(tmpdir(), "exwave-smoke-"));
const children: ChildProcess[] = [];
const SHADCN = "shadcn@4.23.0";
const MOCK_KEY =
  "exw_pk_MXxodHRwOi8vbG9jYWxob3N0OjQwMTB8NmYxYzJhMTAtNWEzZS00YzJiLTlkNGUtMGExYjJjM2Q0ZTVm";

function step(title: string) {
  console.log(`\n▶ ${title}`);
}

function run(command: string, args: string[], cwd: string, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env },
  });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`);
}

function start(command: string, args: string[], cwd: string) {
  const child = spawn(command, args, {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  children.push(child);
  return child;
}

async function waitFor(url: string) {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`${url} never answered`);
}

function check(ok: unknown, what: string) {
  if (!ok) throw new Error(`smoke: ${what}`);
  console.log(`  ✓ ${what}`);
}

async function pack(): Promise<Record<string, string>> {
  step("Build and stage the packages");
  run(process.execPath, ["run", "stage"], repo);
  const out = join(work, "tgz");
  await mkdir(out);
  const tarballs: Record<string, string> = {};
  for (const name of [
    "auth",
    "auth-react",
    "auth-nextjs",
    "auth-mock",
    "create",
  ]) {
    const dir = join(repo, "packages", name, "publish");
    const manifest = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    );
    run("npm", ["pack", "--silent", "--pack-destination", out], dir);
    const file = (await readdir(out)).find((f) =>
      f.startsWith(
        `${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}`,
      ),
    );
    if (!file) throw new Error(`no tarball for ${manifest.name}`);
    tarballs[manifest.name] = join(out, file);
  }
  return tarballs;
}

async function templates(tarballs: Record<string, string>) {
  const create = join(repo, "packages/create/publish/dist/index.js");
  const env = { EXWAVE_CREATE_TARBALLS: JSON.stringify(tarballs) };
  for (const template of ["next", "vite", "next-shadcn"]) {
    step(
      `create-exwave --template ${template}, then install, typecheck, build`,
    );
    const app = join(work, `${template}-app`);
    run(
      "node",
      [create, app, "--template", template, "--no-install", "--yes"],
      work,
      env,
    );
    run("npm", ["install", "--no-audit", "--no-fund"], app);
    if (template !== "vite") {
      run("npx", ["next", "typegen"], app);
      run("npx", ["tsc", "--noEmit"], app);
      run("npx", ["next", "build"], app);
    } else {
      run("npm", ["run", "build"], app);
      const assets = join(app, "dist/assets");
      for (const file of await readdir(assets))
        if (file.endsWith(".js"))
          check(
            !(await readFile(join(assets, file), "utf8")).includes("jsxDEV"),
            `${file} has no development JSX runtime`,
          );
    }
  }
}

async function nextAgainstMock() {
  step("The Next.js app signs in against the mock");
  const app = join(work, "next-app");
  start("node", [join(app, "node_modules/.bin/exwave-auth-mock")], app);
  start("npx", ["next", "start", "--port", "3107"], app);
  await waitFor("http://localhost:4010/orbit/v1/jwks");
  await waitFor("http://localhost:3107/");
  const base = "http://localhost:3107";
  check((await fetch(`${base}/`)).status === 200, "GET / answers 200");
  const signIn = await fetch(`${base}/api/exwave/sign-in`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: base,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ login: "player1", password: "Password123!" }),
  });
  const body = (await signIn.json()) as { user?: { username?: string } };
  check(
    body.user?.username === "player1",
    "POST /api/exwave/sign-in returns the user",
  );
  const cookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  check(
    cookie.startsWith("exwave_session="),
    "sign-in sets the session cookie",
  );
  const session = await fetch(`${base}/api/exwave/session`, {
    headers: { cookie },
  });
  const state = (await session.json()) as { user?: { username?: string } };
  check(
    state.user?.username === "player1",
    "GET /api/exwave/session sees the user",
  );
  const account = await fetch(`${base}/account`, { headers: { cookie } });
  check(
    (await account.text()).includes("Test Player"),
    "/account renders the user on the server",
  );
}

async function coreWithoutReact(tarballs: Record<string, string>) {
  step("The core, alone, under Node: no React, no Next.js");
  const dir = join(work, "core-only");
  await mkdir(dir);
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "core-only",
      private: true,
      type: "module",
      dependencies: {
        "@exwave-nexus/auth": `file:${tarballs["@exwave-nexus/auth"]}`,
      },
    }),
  );
  run("npm", ["install", "--no-audit", "--no-fund"], dir);
  check(!existsSync(join(dir, "node_modules/react")), "react is not installed");
  check(!existsSync(join(dir, "node_modules/next")), "next is not installed");
  await writeFile(
    join(dir, "check.mjs"),
    `import { createExwaveAuth, createExwaveRouteClient, memoryStorage } from "@exwave-nexus/auth";
import { describeError } from "@exwave-nexus/auth/messages";
createExwaveRouteClient();
const auth = createExwaveAuth({ publishableKey: ${JSON.stringify(MOCK_KEY)}, storage: memoryStorage() });
const session = await auth.signIn({ login: "player1", password: "Password123!" });
if (session.user.username !== "player1") throw new Error("no user");
await auth.signIn({ login: "player1", password: "wrong" }).catch((e) => console.log("  " + describeError(e)));
auth.close();
console.log("  signed in as", session.user.username);
`,
  );
  run("node", ["check.mjs"], dir);
}

/** A built registry item, saved locally with our packages from the tarballs. */
async function localItem(name: string, tarballs: Record<string, string>) {
  const item = JSON.parse(
    await readFile(join(repo, `registry/public/r/${name}.json`), "utf8"),
  );
  item.dependencies = item.dependencies.map((dep: string) => {
    const pkg = dep.slice(0, dep.lastIndexOf("@"));
    return tarballs[pkg] ? `${pkg}@file:${tarballs[pkg]}` : dep;
  });
  const local = join(work, `${name}.json`);
  await writeFile(local, JSON.stringify(item));
  return local;
}

async function registry(tarballs: Record<string, string>) {
  step("The auth-nextjs block in a fresh shadcn app");
  const local = await localItem("auth-nextjs", tarballs);
  run(
    "npx",
    [
      "-y",
      SHADCN,
      "init",
      "-t",
      "next",
      "-b",
      "radix",
      "-p",
      "nova",
      "-n",
      "shadcn-app",
      "-y",
      "--no-monorepo",
    ],
    work,
  );
  const app = join(work, "shadcn-app");
  run("npx", ["-y", SHADCN, "add", local, "-y", "-o"], app);
  // The one step the block leaves to you (its install note says so).
  const layoutPath = join(app, "app/layout.tsx");
  const layout = await readFile(layoutPath, "utf8");
  await writeFile(
    layoutPath,
    `import { ExwaveProvider } from "@exwave-nexus/auth-nextjs/client";\nimport { exwave } from "@/lib/exwave";\n${layout
      .replace(
        "export default function RootLayout",
        "export default async function RootLayout",
      )
      .replace(
        "{children}",
        "<ExwaveProvider initialState={await exwave.getAuthState()}>{children}</ExwaveProvider>",
      )}`,
  );
  for (const file of [
    "components/exwave/sign-in-form.tsx",
    "app/(auth)/sign-in/page.tsx",
    "proxy.ts",
    "lib/exwave.ts",
  ])
    check(existsSync(join(app, file)), `installed ${file}`);
  check(
    (await readFile(join(app, ".env.local"), "utf8")).includes(
      "NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY=",
    ),
    ".env.local names the publishable key",
  );
  run("npx", ["tsc", "--noEmit"], app);
  run("npx", ["next", "build"], app);
}

async function registryApp(tarballs: Record<string, string>) {
  step("shadcn create: a new Next.js app from exwave-app");
  const local = await localItem("exwave-app", tarballs);
  run(
    "npx",
    [
      "-y",
      SHADCN,
      "create",
      "-t",
      "next",
      "-n",
      "shadcn-exwave-app",
      local,
      "-y",
      "--no-monorepo",
    ],
    work,
  );
  const app = join(work, "shadcn-exwave-app");
  const source = (path: string) =>
    readFile(join(repo, "registry/next-app", path), "utf8");
  for (const file of ["app/page.tsx", "app/layout.tsx"])
    check(
      (await readFile(join(app, file), "utf8")) === (await source(file)),
      `${file} is the app's, not the starter's`,
    );
  check(
    (await readFile(join(app, "app/globals.css"), "utf8")).includes(
      "--primary: #006fa7",
    ),
    "app/globals.css has Exwave's colors",
  );
  run("npx", ["tsc", "--noEmit"], app);
  run("npx", ["next", "build"], app);
}

try {
  const tarballs = await pack();
  if (!flags.has("--only-registry")) {
    await templates(tarballs);
    await nextAgainstMock();
    await coreWithoutReact(tarballs);
  }
  if (!flags.has("--no-registry")) {
    await registry(tarballs);
    await registryApp(tarballs);
  }
  console.log("\n✓ smoke passed");
} finally {
  for (const child of children) child.kill();
  if (!flags.has("--keep")) await rm(work, { recursive: true, force: true });
  else console.log(`kept ${work}`);
}
