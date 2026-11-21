import { afterAll, describe, expect, test } from "bun:test";
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
import { encodePublishableKey } from "@exwave-nexus/auth";
import { detectPackageManager, runCommand } from "./pm";
import { MOCK_KEY, packageName, ScaffoldError, scaffold } from "./scaffold";

const templatesDir = new URL("../templates/", import.meta.url).pathname;
const work = await mkdtemp(join(tmpdir(), "create-exwave-"));
afterAll(() => rm(work, { recursive: true, force: true }));

const KEY = encodePublishableKey({
  authOrigin: "https://auth.example.test",
  platformId: "6f1c2a10-5a3e-4c2b-9d4e-0a1b2c3d4e5f",
});

async function files(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory())
      out.push(...(await files(join(dir, entry.name), `${path}/`)));
    else out.push(path);
  }
  return out;
}

describe.each(["next", "vite"] as const)("the %s template", (template) => {
  test("becomes the user's app, with their key", async () => {
    const dir = join(work, `My ${template} App`);
    const app = await scaffold({
      dir,
      template,
      key: KEY,
      version: "9.9.9",
      templatesDir,
    });
    const list = await files(dir);
    expect(list).toContain(".gitignore");
    expect(list.some((path) => /(^|\/)_/.test(path))).toBe(false);
    expect(list.some((path) => path.includes("node_modules"))).toBe(false);
    expect(list.some((path) => path.includes(".next/"))).toBe(false);
    expect(list).not.toContain(".env.development");

    const manifest = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    );
    expect(manifest.name).toBe(`my-${template}-app`);
    expect(manifest.dependencies["@exwave-nexus/auth"]).toBe("9.9.9");
    expect(JSON.stringify(manifest)).not.toContain("workspace:");
    expect(manifest.scripts.mock).toBeUndefined();
    expect(app.usesMock).toBe(false);

    const env = await readFile(join(dir, ".env.local"), "utf8");
    expect(env).toContain(`=${KEY}\n`);
    if (template === "next")
      expect(env).toMatch(/\nEXWAVE_COOKIE_SECRET=[A-Za-z0-9_-]{43}\n/);
    else expect(env).not.toContain("EXWAVE_COOKIE_SECRET");
  });

  test("without a key, wires the local mock", async () => {
    const dir = join(work, `${template}-mock`);
    const app = await scaffold({
      dir,
      template,
      key: null,
      version: "9.9.9",
      templatesDir,
    });
    const manifest = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    );
    expect(manifest.scripts.mock).toBe("exwave-auth-mock");
    expect(manifest.devDependencies["@exwave-nexus/auth-mock"]).toBe("9.9.9");
    expect(await readFile(join(dir, ".env.local"), "utf8")).toContain(MOCK_KEY);
    expect(app.usesMock).toBe(true);
  });
});

describe("scaffold", () => {
  test("refuses a directory that isn't empty", async () => {
    const dir = join(work, "taken");
    await mkdir(dir);
    await writeFile(join(dir, "notes.txt"), "mine");
    const error = await scaffold({
      dir,
      template: "next",
      key: null,
      version: "9.9.9",
      templatesDir,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ScaffoldError);
    expect(existsSync(join(dir, "package.json"))).toBe(false);
  });

  test("refuses a key that isn't a publishable key", async () => {
    const error = await scaffold({
      dir: join(work, "bad-key"),
      template: "vite",
      key: "sk_live_nope",
      version: "9.9.9",
      templatesDir,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ScaffoldError);
  });

  test("tarballs replace versions, for the smoke test", async () => {
    const dir = join(work, "tarballs");
    await scaffold({
      dir,
      template: "vite",
      key: null,
      version: "9.9.9",
      templatesDir,
      tarballs: { "@exwave-nexus/auth": "/tmp/auth.tgz" },
    });
    const manifest = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    );
    expect(manifest.dependencies["@exwave-nexus/auth"]).toBe(
      "file:/tmp/auth.tgz",
    );
  });

  test("package names come from the directory", () => {
    expect(packageName("/x/My Cool App!")).toBe("my-cool-app");
    expect(packageName("/x/__")).toBe("exwave-app");
  });
});

test.each([
  ["npm/10.9.0 node/v24.1.0 linux x64", "npm", "npm run dev"],
  ["pnpm/10.2.0 npm/? node/v24.1.0", "pnpm", "pnpm dev"],
  ["yarn/4.9.1 npm/? node/v24.1.0", "yarn", "yarn dev"],
  ["bun/1.4.3 npm/? node/v24.3.0", "bun", "bun dev"],
  ["", "npm", "npm run dev"],
] as const)("detects %s", (agent, pm, dev) => {
  expect(detectPackageManager(agent)).toBe(pm);
  expect(runCommand(pm, "dev")).toBe(dev);
});

describe("the CLI", () => {
  const cli = new URL("./index.ts", import.meta.url).pathname;
  const run = (args: string[]) =>
    Bun.spawnSync(["bun", cli, ...args], {
      cwd: work,
      stdin: "ignore",
      env: { ...process.env, npm_config_user_agent: "npm/10.9.0" },
    });

  test("with flags it needs no terminal", () => {
    const result = run(["flags-app", "--template", "vite", "--no-install"]);
    expect(result.exitCode).toBe(0);
    const out = result.stdout.toString();
    expect(out).toContain("npm run dev");
    expect(out).toContain("npm run mock");
    expect(existsSync(join(work, "flags-app", "package.json"))).toBe(true);
  });

  test("without a terminal or a template, it says what to pass", () => {
    const result = run(["no-template", "--no-install"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("--template next");
  });

  test("a bad key stops before anything is written", () => {
    const result = run(["bad", "-t", "next", "-k", "nope", "--no-install"]);
    expect(result.exitCode).toBe(1);
    expect(existsSync(join(work, "bad"))).toBe(false);
  });
});
