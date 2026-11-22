import { parseArgs } from "node:util";

export const TEMPLATES = {
  next: "Next.js (App Router, server sessions)",
  vite: "React with Vite (browser sessions)",
  "next-shadcn": "Next.js with shadcn/ui and Tailwind",
} as const;
export type Template = keyof typeof TEMPLATES;

export interface Args {
  dir?: string;
  template?: Template;
  key?: string;
  install?: boolean;
  yes: boolean;
  help: boolean;
}

export class UsageError extends Error {}

export const USAGE = `Create an app with Exwave Auth.

Usage
  npm create exwave@latest [dir] -- [options]

Options
  -t, --template <name>       next: Next.js; vite: React with Vite;
                              next-shadcn: Next.js with shadcn/ui
  -k, --key <exw_pk_…>        Your platform's publishable key (Nexus → Auth).
                              Without one, the app uses a local mock.
      --install / --no-install
                              Install dependencies (default: yes)
  -y, --yes                   Don't ask: take the defaults
  -h, --help                  Show this help`;

export function readArgs(argv: string[]): Args {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      template: { type: "string", short: "t" },
      key: { type: "string", short: "k" },
      install: { type: "boolean" },
      "no-install": { type: "boolean" },
      yes: { type: "boolean", short: "y" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (positionals.length > 1)
    throw new UsageError(
      `Expected one directory, got ${positionals.join(" ")}`,
    );
  const template = values.template;
  if (template !== undefined && !(template in TEMPLATES))
    throw new UsageError(
      `Unknown template "${template}": use ${Object.keys(TEMPLATES).join(", ")}`,
    );
  return {
    dir: positionals[0],
    template: template as Template | undefined,
    key: values.key,
    install: values["no-install"] ? false : values.install,
    yes: values.yes ?? false,
    help: values.help ?? false,
  };
}
