// create-exwave: `npm create exwave@latest`. Asks what it needs (or takes
// flags), copies a template, installs, and says what to do next.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readArgs, TEMPLATES, type Template, USAGE, UsageError } from "./args";
import { detectPackageManager, installCommand, runCommand } from "./pm";
import { createPrompt } from "./prompt";
import { checkKey, ScaffoldError, scaffold } from "./scaffold";

const GUIDE = "https://www.exwave.net/docs/auth/get-started/";
const PORTS: Record<Template, number> = {
  next: 3000,
  vite: 5173,
  "next-shadcn": 3000,
};

/** Published: dist/templates. In this repo: packages/create/templates. */
function templatesDir(): string {
  const bundled = new URL("./templates/", import.meta.url);
  if (existsSync(bundled)) return fileURLToPath(bundled);
  return fileURLToPath(new URL("../templates/", import.meta.url));
}

function ownVersion(): string {
  const manifest = new URL("../package.json", import.meta.url);
  return JSON.parse(readFileSync(manifest, "utf8")).version;
}

async function main(argv: string[]) {
  const args = readArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }
  const interactive = Boolean(process.stdin.isTTY) && !args.yes;
  const prompt = interactive ? createPrompt() : null;
  try {
    const dir = args.dir ?? (await prompt?.text("Project directory", "my-app"));
    if (!dir)
      throw new UsageError("Name a directory: npm create exwave@latest my-app");
    const template =
      args.template ?? (await prompt?.choose("Which kind of app?", TEMPLATES));
    if (!template)
      throw new UsageError(
        "Choose a template: --template next, vite or next-shadcn",
      );
    let key = args.key ?? null;
    if (args.key === undefined && prompt)
      key =
        (await prompt.text(
          "Publishable key from Nexus → Auth (empty: use a local mock)",
        )) || null;
    if (key) checkKey(key);
    const install =
      args.install ??
      (prompt ? await prompt.confirm("Install dependencies?") : true);
    prompt?.close();

    const tarballs = process.env.EXWAVE_CREATE_TARBALLS
      ? JSON.parse(process.env.EXWAVE_CREATE_TARBALLS)
      : undefined;
    const app = await scaffold({
      dir,
      template,
      key,
      version: ownVersion(),
      templatesDir: templatesDir(),
      tarballs,
    });
    const pm = detectPackageManager();
    const where = relative(process.cwd(), app.target) || ".";
    console.log(
      `\nCreated ${where} with Exwave Auth (${TEMPLATES[template]}).`,
    );

    let installed = false;
    if (install) {
      const [command = "npm", ...rest] = installCommand(pm);
      console.log(`\nInstalling dependencies with ${pm}…\n`);
      const result = spawnSync(command, rest, {
        cwd: app.target,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      installed = result.status === 0;
      if (!installed)
        console.log(`\nInstalling failed. Run it yourself in ${where}.`);
    }

    const port = PORTS[template];
    const steps = [`cd ${where}`];
    if (!installed) steps.push(installCommand(pm).join(" "));
    steps.push(`${runCommand(pm, "dev")}   → http://localhost:${port}`);
    console.log(`\nNext:\n${steps.map((step) => `  ${step}`).join("\n")}`);
    if (app.usesMock)
      console.log(`
No publishable key yet, so the app talks to a local mock of Exwave Auth.
Start it in a second terminal, then sign in as player1 / Password123!:
  ${runCommand(pm, "mock")}
Email links are printed there. When your platform is ready, put its key
from Nexus → Auth in .env.local.`);
    else
      console.log(`
In Nexus → Auth → Settings, add http://localhost:${port} to Redirect URLs, so
verification and password reset links can land on your app.`);
    console.log(`\nGuide: ${GUIDE}\n`);
  } finally {
    prompt?.close();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof UsageError || error instanceof ScaffoldError) {
    console.error(`\n${error.message}\n`);
    if (error instanceof UsageError) console.error(USAGE);
    process.exit(1);
  }
  throw error;
});
