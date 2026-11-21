/** What an email link carries: `?exwave_verify=…&uid=…` or `?exwave_reset=…&uid=…`. */
export interface EmailLinkParams {
  type: "verify" | "reset";
  userId: string;
  code: string;
}

/** Reads an email link's code from a URL, or `null` when it has none. */
export function parseEmailLink(url: string | URL): EmailLinkParams | null {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return null;
  }
  const userId = params.get("uid");
  if (!userId) return null;
  const reset = params.get("exwave_reset");
  if (reset) return { type: "reset", userId, code: reset };
  const verify = params.get("exwave_verify");
  if (verify) return { type: "verify", userId, code: verify };
  return null;
}

/** The URL without its email-link parameters, to put back in the address bar. */
export function withoutEmailLink(url: string | URL): string {
  const clean = new URL(url);
  for (const name of ["exwave_verify", "exwave_reset", "uid"])
    clean.searchParams.delete(name);
  return clean.href;
}
