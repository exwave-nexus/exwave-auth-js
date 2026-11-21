/** The package manager that ran `create`, from `npm_config_user_agent`. */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export function detectPackageManager(
  userAgent = process.env.npm_config_user_agent ?? "",
): PackageManager {
  const name = userAgent.split("/")[0];
  return name === "pnpm" || name === "yarn" || name === "bun" ? name : "npm";
}

export const installCommand = (pm: PackageManager) =>
  pm === "yarn" ? ["yarn"] : [pm, "install"];

/** How to run a package.json script: `npm run dev`, `pnpm dev`… */
export const runCommand = (pm: PackageManager, script: string) =>
  pm === "npm" ? `npm run ${script}` : `${pm} ${script}`;
