import type { SignOutReason } from "../client";
import { ExwaveAuthError, isExwaveAuthError } from "../errors";
import type { ServerSession } from "./cookie";
import type { ExwaveServerAuth, RefreshResult } from "./index";

export interface HandlerOptions {
  /** Default `redirectTo` for email links when the browser sends none. */
  links?: { verifyEmail?: string; resetPassword?: string };
}

type Body = Record<string, unknown>;

function text(body: Body, field: string, optional?: false): string;
function text(body: Body, field: string, optional: true): string | undefined;
function text(body: Body, field: string, optional = false) {
  const value = body[field];
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string" || value.length > 1024)
    throw new ExwaveAuthError("invalid_request", 400);
  return value;
}

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  const response = Response.json(body, { status, headers });
  response.headers.set("cache-control", "no-store");
  return response;
}

/** Browsers send these on every request; a missing header fails closed. */
function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  return request.headers.get("origin") === new URL(request.url).origin;
}

/**
 * The auth routes for a backend app, as `Request → Response`. Mount it at
 * `/api/exwave/*`; `action` is the path after that prefix. The refresh token
 * never leaves the server: the browser only gets the sealed httpOnly cookie.
 *
 * - `POST sign-up | sign-in | verify-email | verify-email/resend |
 *   password-reset | password-reset/confirm | sign-out` (camelCase JSON bodies)
 * - `GET session`: `{player, expiresAt}`, refreshing when needed; signed out,
 *   `{player: null, expiresAt: null, signOutReason}` says why (or `null`)
 * - `GET token`: `{access_token, token_type, expires_in}` for a game on the
 *   page, same origin only (`Sec-Fetch-Site: same-origin`)
 * - `GET config`
 */
export async function handleAuthRequest(
  auth: ExwaveServerAuth,
  request: Request,
  action: string,
  options: HandlerOptions = {},
): Promise<Response> {
  const route = `${request.method} ${action}`;
  const secure = auth.isSecureRequest(request.url);
  const setCookies = (...values: string[]): [string, string][] =>
    values.map((value) => ["set-cookie", value]);
  // Starting a session forgets why the last one ended.
  const signedIn = async (session: ServerSession, status = 200) =>
    json(
      { player: session.player, expiresAt: session.expiresAt },
      status,
      setCookies(
        await auth.sessionCookie(session, secure),
        ...(auth.readSignOutReason(request)
          ? [auth.clearSignOutReasonCookie(secure)]
          : []),
      ),
    );
  const ended = (reason: SignOutReason) =>
    setCookies(
      auth.clearCookie(secure),
      auth.signOutReasonCookie(reason, secure),
    );

  try {
    if (request.method === "POST" && !sameOrigin(request))
      return json({ error: "forbidden" }, 403);
    if (
      route === "GET token" &&
      request.headers.get("sec-fetch-site") !== "same-origin"
    )
      return json({ error: "forbidden" }, 403);

    const body: Body =
      request.method === "POST"
        ? (((await request.json().catch(() => ({}))) as Body) ?? {})
        : {};
    const origin = new URL(request.url).origin;
    const link = (path: string | undefined) =>
      text(body, "redirectTo", true) ??
      (path ? new URL(path, origin).href : undefined);

    switch (route) {
      case "POST sign-up":
        return json(
          await auth.signUp({
            email: text(body, "email"),
            password: text(body, "password"),
            displayName: text(body, "displayName"),
            username: text(body, "username", true),
            redirectTo: link(options.links?.verifyEmail),
          }),
          201,
        );
      case "POST verify-email":
        return signedIn(
          await auth.verifyEmail({
            userId: text(body, "userId"),
            code: text(body, "code"),
          }),
        );
      case "POST verify-email/resend":
        await auth.resendVerification({
          email: text(body, "email"),
          redirectTo: link(options.links?.verifyEmail),
        });
        return new Response(null, { status: 202 });
      case "POST sign-in":
        return signedIn(
          await auth.signIn({
            login: text(body, "login"),
            password: text(body, "password"),
          }),
        );
      case "POST password-reset":
        await auth.resetPassword({
          email: text(body, "email"),
          redirectTo: link(options.links?.resetPassword),
        });
        return new Response(null, { status: 202 });
      case "POST password-reset/confirm":
        return signedIn(
          await auth.confirmPasswordReset({
            userId: text(body, "userId"),
            code: text(body, "code"),
            password: text(body, "password"),
          }),
        );
      case "POST sign-out": {
        const everywhere = body.everywhere === true;
        const session = await auth.readCookie(request);
        let reason: SignOutReason = "signed_out";
        try {
          if (session) {
            await auth.signOut(session, { everywhere });
            if (everywhere) reason = "signed_out_everywhere";
          }
        } catch (error) {
          // The cookie goes either way; everywhere needs the API to succeed.
          if (everywhere && isExwaveAuthError(error))
            return json(
              { error: error.code },
              error.status || 503,
              ended("signed_out"),
            );
        }
        return new Response(null, { status: 204, headers: ended(reason) });
      }
      case "GET session":
      case "GET token": {
        const token = route === "GET token";
        const session = await auth.readCookie(request);
        if (!session)
          return token
            ? json({ error: "not_signed_in" }, 401)
            : json({
                player: null,
                expiresAt: null,
                signOutReason: auth.readSignOutReason(request),
              });
        let result: RefreshResult;
        try {
          result = await auth.refreshSession(session);
        } catch (error) {
          // Auth unreachable: a PAT that has not expired yet still works.
          if (session.expiresAt <= auth.now()) throw error;
          result = { session, cookie: "keep" };
        }
        if (!result.session) {
          const headers = ended(result.reason);
          return token
            ? json({ error: result.error.code }, result.error.status, headers)
            : json(
                { player: null, expiresAt: null, signOutReason: result.reason },
                200,
                headers,
              );
        }
        const headers =
          result.cookie === "write"
            ? setCookies(await auth.sessionCookie(result.session, secure))
            : [];
        const { accessToken, expiresAt, player } = result.session;
        return token
          ? json(
              {
                access_token: accessToken,
                token_type: "Bearer",
                expires_in: Math.floor((expiresAt - auth.now()) / 1000),
              },
              200,
              headers,
            )
          : json({ player, expiresAt }, 200, headers);
      }
      case "GET config":
        return json(await auth.getConfig());
      default:
        return json({ error: "not_found" }, 404);
    }
  } catch (error) {
    if (!isExwaveAuthError(error)) throw error;
    const headers: Record<string, string> = {};
    if (error.retryAfter) headers["retry-after"] = String(error.retryAfter);
    return json(
      { error: error.code, failedRules: error.failedRules },
      error.status || 503,
      headers,
    );
  }
}
