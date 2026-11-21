// The shadcn registry: `registry/exwave/*` holds the components, the Next.js
// template holds the pages and wiring the auth-nextjs block installs. This
// writes registry/registry.json, builds registry/public/r/*.json with
// `shadcn build`, and keeps the templates' copies of the components in step.
//
//   bun scripts/registry.ts build   # registry.json, then public/r/
//   bun scripts/registry.ts sync    # copy the components into the templates
//   bun scripts/registry.ts check   # fail when a template's copy differs
import { readdir } from "node:fs/promises";

const repo = new URL("../", import.meta.url);
const COMPONENTS = "registry/exwave/";
const NEXT = "packages/create/templates/next/";
/** Where each template keeps its copy of the components. */
const COPIES = [
  `${NEXT}components/exwave/`,
  "packages/create/templates/vite/src/components/exwave/",
];

const ui = (...names: string[]) => names;
const PRIMITIVES = ui("button", "input", "label", "card");

/** Each component, with the components it imports and the primitives it needs. */
const ITEMS: Record<
  string,
  {
    title: string;
    description: string;
    uses?: string[];
    ui?: string[];
    npm?: string[];
  }
> = {
  "sign-in-form": {
    title: "Sign in form",
    description:
      "Email or username and password, with the reason the last session ended and a new verification link when needed.",
    uses: ["auth-link"],
    ui: PRIMITIVES,
  },
  "sign-up-form": {
    title: "Sign up form",
    description:
      "Name, email and password with the platform's rules ticked off as you type, then a check-your-email step with resend.",
    uses: ["auth-link", "password-rules"],
    ui: PRIMITIVES,
  },
  "verify-email": {
    title: "Verify email",
    description:
      "The page verification emails link to: verifies the email, signs in and moves on.",
    uses: ["auth-link"],
    ui: ui("card"),
  },
  "forgot-password-form": {
    title: "Forgot password form",
    description: "Sends a link to choose a new password.",
    uses: ["auth-link"],
    ui: PRIMITIVES,
  },
  "reset-password-form": {
    title: "Reset password form",
    description:
      "The page password reset emails link to: choose a new password, then sign in.",
    uses: ["auth-link", "password-rules"],
    ui: PRIMITIVES,
  },
  "sign-out-button": {
    title: "Sign out button",
    description: "Signs out here, or on every device.",
    ui: ui("button"),
  },
  "user-button": {
    title: "User button",
    description:
      "A Sign in button when signed out; an avatar menu with the account and sign-out when signed in.",
    ui: ui("button", "avatar", "dropdown-menu"),
  },
};

/** Helpers the components share, installed alongside them. */
const HELPERS: Record<string, { npm?: string[] }> = {
  "auth-link": {},
  "password-rules": { npm: ["lucide-react"] },
};

const NEXT_PAGES = [
  "sign-in",
  "sign-up",
  "verify",
  "forgot-password",
  "reset-password",
];

type RegistryFile = { path: string; type: string; target: string };

async function authVersion(): Promise<string> {
  const manifest = await Bun.file(
    new URL("packages/auth/package.json", repo),
  ).json();
  return manifest.version;
}

const componentFile = (name: string): RegistryFile => ({
  path: `${COMPONENTS}${name}.tsx`,
  type: "registry:component",
  target: `@components/exwave/${name}.tsx`,
});

function filesFor(names: string[]): RegistryFile[] {
  const all = new Set<string>();
  for (const name of names) {
    all.add(name);
    for (const used of ITEMS[name]?.uses ?? []) all.add(used);
  }
  return [...all].map(componentFile);
}

function npmFor(names: string[], auth: string): string[] {
  const deps = new Set([auth]);
  for (const name of names)
    for (const used of [name, ...(ITEMS[name]?.uses ?? [])])
      for (const dep of HELPERS[used]?.npm ?? ITEMS[used]?.npm ?? [])
        deps.add(dep);
  return [...deps];
}

function uiFor(names: string[]): string[] {
  return [...new Set(names.flatMap((name) => ITEMS[name]?.ui ?? []))];
}

export async function registryJson() {
  const auth = `@exwave-nexus/auth@^${await authVersion()}`;
  const everything = Object.keys(ITEMS);
  const items: object[] = Object.entries(ITEMS).map(([name, item]) => ({
    name,
    type: "registry:component",
    title: item.title,
    description: item.description,
    dependencies: npmFor([name], auth),
    registryDependencies: uiFor([name]),
    files: filesFor([name]),
  }));

  items.push({
    name: "auth-nextjs",
    type: "registry:block",
    title: "Exwave Auth for Next.js",
    description:
      "Sign-in, sign-up, email verification and password reset pages for the App Router, with the /api/exwave routes, the session proxy and every component.",
    dependencies: npmFor(everything, auth),
    registryDependencies: uiFor(everything),
    files: [
      ...filesFor(everything),
      ...NEXT_PAGES.map((page) => ({
        path: `${NEXT}app/(auth)/${page}/page.tsx`,
        type: "registry:page",
        target: `app/(auth)/${page}/page.tsx`,
      })),
      {
        path: `${NEXT}app/(auth)/layout.tsx`,
        type: "registry:page",
        target: "app/(auth)/layout.tsx",
      },
      {
        path: `${NEXT}app/api/exwave/[...action]/route.ts`,
        type: "registry:file",
        target: "app/api/exwave/[...action]/route.ts",
      },
      {
        path: `${NEXT}lib/exwave.ts`,
        type: "registry:lib",
        target: "@lib/exwave.ts",
      },
      { path: `${NEXT}proxy.ts`, type: "registry:file", target: "~/proxy.ts" },
    ],
    envVars: {
      NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY: "exw_pk_from_nexus",
      EXWAVE_COOKIE_SECRET: "",
    },
    docs: "Set NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY (Nexus → Auth) and EXWAVE_COOKIE_SECRET (openssl rand -base64 32) in .env.local, then wrap app/layout.tsx's body in <ExwaveProvider initialState={await exwave.getAuthState()}> from @exwave-nexus/auth/next/client. Guide: https://www.exwave.net/docs/auth/get-started/",
  });

  items.push({
    name: "auth-react",
    type: "registry:block",
    title: "Exwave Auth for React (Vite)",
    description:
      "Every sign-in, sign-up, email verification and password reset component, for a React app that talks to Exwave Auth from the browser.",
    dependencies: npmFor(everything, auth),
    registryDependencies: uiFor(everything),
    files: filesFor(everything),
    envVars: { VITE_EXWAVE_PUBLISHABLE_KEY: "exw_pk_from_nexus" },
    docs: "Set VITE_EXWAVE_PUBLISHABLE_KEY (Nexus → Auth) in .env.local, then wrap your app in <ExwaveProvider publishableKey={import.meta.env.VITE_EXWAVE_PUBLISHABLE_KEY} navigate={yourRouterNavigate}> from @exwave-nexus/auth/react, and give each form a route. Guide: https://www.exwave.net/docs/auth/get-started/",
  });

  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "exwave",
    homepage: "https://www.exwave.net/docs/auth/",
    items,
  };
}

async function componentNames() {
  return (await readdir(new URL(COMPONENTS, repo)))
    .filter((file) => file.endsWith(".tsx"))
    .sort();
}

async function sync(write: boolean): Promise<string[]> {
  const stale: string[] = [];
  for (const file of await componentNames()) {
    const source = await Bun.file(new URL(`${COMPONENTS}${file}`, repo)).text();
    for (const copy of COPIES) {
      const target = Bun.file(new URL(`${copy}${file}`, repo));
      if ((await target.exists()) && (await target.text()) === source) continue;
      stale.push(`${copy}${file}`);
      if (write) await Bun.write(target, source);
    }
  }
  return stale;
}

if (import.meta.main) {
  const command = process.argv[2];
  if (command === "build") {
    const file = new URL("registry/registry.json", repo);
    await Bun.write(file, `${JSON.stringify(await registryJson(), null, 2)}\n`);
    const shadcn = Bun.spawnSync(
      [
        "bunx",
        "shadcn",
        "build",
        "registry/registry.json",
        "-o",
        "registry/public/r",
      ],
      { cwd: repo.pathname, stdout: "inherit", stderr: "inherit" },
    );
    process.exit(shadcn.exitCode ?? 1);
  } else if (command === "sync") {
    for (const path of await sync(true)) console.log(`updated ${path}`);
  } else if (command === "check") {
    const stale = await sync(false);
    if (stale.length) {
      console.error(
        `These copies differ from registry/exwave (run bun scripts/registry.ts sync):\n  ${stale.join("\n  ")}`,
      );
      process.exit(1);
    }
    console.log("The templates' components match registry/exwave.");
  } else {
    console.error("usage: bun scripts/registry.ts build | sync | check");
    process.exit(1);
  }
}
