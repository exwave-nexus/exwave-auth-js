// The shadcn registry: `registry/exwave/*` holds the components,
// `registry/next/*` the pages and wiring the auth-nextjs block installs, and
// `registry/next-app/*` the rest of the full app (exwave-app), whose
// app/globals.css also holds the Exwave theme (`registry/ui` is shadcn's own
// primitives, only there to typecheck against). This writes
// registry/registry.json, then builds registry/public/r/*.json with
// `shadcn build`.
//
//   bun scripts/registry.ts build

const repo = new URL("../", import.meta.url);
const COMPONENTS = "registry/exwave/";
const NEXT = "registry/next/";
const APP = "registry/next-app/";
const LOGO = "packages/create/shared/exwave.svg";

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

/** The npm packages the components need: ours (`exwave`), then the helpers'. */
function npmFor(names: string[], exwave: string[]): string[] {
  const deps = new Set(exwave);
  for (const name of names)
    for (const used of [name, ...(ITEMS[name]?.uses ?? [])])
      for (const dep of HELPERS[used]?.npm ?? ITEMS[used]?.npm ?? [])
        deps.add(dep);
  return [...deps];
}

function uiFor(names: string[]): string[] {
  return [...new Set(names.flatMap((name) => ITEMS[name]?.ui ?? []))];
}

type CssVars = Record<string, string>;

/** The `--name: value;` declarations of one block of the app's globals.css. */
function declarations(css: string, selector: string): CssVars {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`${APP}app/globals.css has no ${selector}`);
  const body = css.slice(start, css.indexOf("\n}", start));
  return Object.fromEntries(
    [...body.matchAll(/^\s*--([\w-]+):\s*(.+?);$/gm)].map(([, k, v]) => [
      k as string,
      (v as string).replace(/\s+/g, " "),
    ]),
  );
}

/** Exwave's theme as shadcn cssVars, read from the app's globals.css. */
async function exwaveTheme() {
  const css = await Bun.file(new URL(`${APP}app/globals.css`, repo)).text();
  const inline = declarations(css, "@theme inline");
  // Only what Exwave adds to shadcn's own @theme inline: the font and the
  // success and warning colors.
  const theme = Object.fromEntries(
    Object.entries(inline).filter(
      ([name]) => name === "font-sans" || /^color-(success|warning)/.test(name),
    ),
  );
  return {
    theme,
    light: declarations(css, ":root"),
    dark: declarations(css, ".dark"),
  };
}

export async function registryJson() {
  const version = await authVersion();
  const exwave = (name: string) => `@exwave-nexus/${name}@^${version}`;
  // The components import @exwave-nexus/auth/messages and the React hooks.
  const auth = [exwave("auth"), exwave("auth-react")];
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

  // The auth pages and the server wiring, without the (auth) layout: the
  // block brings a plain one, the full app its own.
  const nextWiring: RegistryFile[] = [
    ...NEXT_PAGES.map((page) => ({
      path: `${NEXT}app/(auth)/${page}/page.tsx`,
      type: "registry:page",
      target: `app/(auth)/${page}/page.tsx`,
    })),
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
  ];
  const nextEnv = {
    NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY: "exw_pk_from_nexus",
    EXWAVE_COOKIE_SECRET: "",
  };

  items.push({
    name: "auth-nextjs",
    type: "registry:block",
    title: "Exwave Auth for Next.js",
    description:
      "Sign-in, sign-up, email verification and password reset pages for the App Router, with the /api/exwave routes, the session proxy and every component.",
    dependencies: npmFor(everything, [...auth, exwave("auth-nextjs")]),
    registryDependencies: uiFor(everything),
    files: [
      ...filesFor(everything),
      ...nextWiring,
      {
        path: `${NEXT}app/(auth)/layout.tsx`,
        type: "registry:page",
        target: "app/(auth)/layout.tsx",
      },
    ],
    envVars: nextEnv,
    docs: "Set NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY (Nexus → Auth) and EXWAVE_COOKIE_SECRET (openssl rand -base64 32) in .env.local, then wrap app/layout.tsx's body in <ExwaveProvider initialState={await exwave.getAuthState()}> from @exwave-nexus/auth-nextjs/client. Guide: https://www.exwave.net/docs/auth/get-started/",
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
    docs: "Set VITE_EXWAVE_PUBLISHABLE_KEY (Nexus → Auth) in .env.local, then wrap your app in <ExwaveProvider publishableKey={import.meta.env.VITE_EXWAVE_PUBLISHABLE_KEY} navigate={yourRouterNavigate}> from @exwave-nexus/auth-react, and give each form a route. Guide: https://www.exwave.net/docs/auth/get-started/",
  });

  const theme = await exwaveTheme();
  const font = "@fontsource-variable/nunito-sans";

  items.push({
    name: "exwave-theme",
    type: "registry:theme",
    title: "Exwave theme",
    description:
      "Exwave's colors for light and dark, Nunito Sans, and success and warning colors, for any shadcn/ui app.",
    dependencies: [font],
    cssVars: theme,
    docs: `Import "${font}" once, in app/layout.tsx (or your entry file), so the font loads.`,
  });

  const app: [string, string, string][] = [
    ["app/layout.tsx", "registry:page", "app/layout.tsx"],
    ["app/page.tsx", "registry:page", "app/page.tsx"],
    ["app/account/page.tsx", "registry:page", "app/account/page.tsx"],
    ["app/(auth)/layout.tsx", "registry:page", "app/(auth)/layout.tsx"],
    [
      "components/theme-provider.tsx",
      "registry:component",
      "@components/theme-provider.tsx",
    ],
    [
      "components/exwave/backend-notice.tsx",
      "registry:component",
      "@components/exwave/backend-notice.tsx",
    ],
    ["lib/local-mock.ts", "registry:lib", "@lib/local-mock.ts"],
  ];
  items.push({
    name: "exwave-app",
    type: "registry:base",
    title: "Exwave Auth app for Next.js",
    description:
      "A whole Next.js app with Exwave Auth on shadcn/ui, in Exwave's colors: the home page, every auth screen, the account page, the /api/exwave routes and the session proxy.",
    config: {
      style: "radix-nova",
      iconLibrary: "lucide",
      rsc: true,
      tailwind: { baseColor: "neutral" },
      registries: { "@exwave": "https://www.exwave.net/r/{name}.json" },
    },
    dependencies: [
      ...npmFor(everything, [...auth, exwave("auth-nextjs")]),
      font,
      "next-themes",
    ],
    registryDependencies: [
      ...new Set([...uiFor(everything), "alert", "avatar", "badge", "card"]),
    ],
    cssVars: theme,
    files: [
      ...filesFor(everything),
      ...nextWiring,
      ...app.map(([path, type, target]) => ({
        path: `${APP}${path}`,
        type,
        target,
      })),
      { path: LOGO, type: "registry:file", target: "~/public/exwave.svg" },
      { path: LOGO, type: "registry:file", target: "~/app/icon.svg" },
    ],
    envVars: nextEnv,
    docs: "Set NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY (Nexus → Auth) and EXWAVE_COOKIE_SECRET (openssl rand -base64 32) in .env.local, then npm run dev. Guide: https://www.exwave.net/docs/auth/get-started/",
  });

  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "exwave",
    homepage: "https://www.exwave.net/docs/auth/",
    items,
  };
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
  } else {
    console.error("usage: bun scripts/registry.ts build");
    process.exit(1);
  }
}
