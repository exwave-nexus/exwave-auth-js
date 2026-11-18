import { cookies, headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { REFRESH_MARGIN_MS } from "../client";
import {
  COOKIE_MAX_AGE_SECONDS,
  createExwaveServerAuth,
  type ExwaveServerAuth,
  type ExwaveServerAuthOptions,
  handleAuthRequest,
  isSecureRequest,
  type RefreshResult,
  type ServerSession,
} from "../server";
import type {
  CodeInput,
  EmailInput,
  PasswordResetConfirmInput,
  Player,
  SignInInput,
  SignUpInput,
  SignUpResult,
} from "../types";

export { ExwaveAuthError, isExwaveAuthError } from "../errors";

export interface ExwaveNextOptions extends Partial<ExwaveServerAuthOptions> {
  /** Pages the email links land on, relative to the app. */
  paths?: { verifyEmail?: string; resetPassword?: string };
  /** The app's public origin for email links. Default: the request's `Host`. */
  appUrl?: string;
}

/** What server code may see. The refresh token stays in the cookie. */
export interface NextSession {
  player: Player;
  accessToken: string;
  expiresAt: number;
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Managed auth for the Next.js App Router. With no options it reads
 * `NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY` and `EXWAVE_COOKIE_SECRET`, lazily, so
 * builds don't need them.
 */
export function createExwaveNext(options: ExwaveNextOptions = {}) {
  let instance: ExwaveServerAuth | undefined;
  const server = () => {
    instance ??= createExwaveServerAuth({
      ...options,
      publishableKey:
        options.publishableKey ??
        process.env.NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY ??
        process.env.EXWAVE_PUBLISHABLE_KEY ??
        "",
      cookieSecret:
        options.cookieSecret ?? process.env.EXWAVE_COOKIE_SECRET ?? "",
    });
    return instance;
  };
  const paths = {
    verifyEmail: "/verify",
    resetPassword: "/reset-password",
    ...options.paths,
  };

  async function appOrigin(): Promise<string> {
    if (options.appUrl) return new URL(options.appUrl).origin;
    const h = await headers();
    const host = h.get("host") ?? "localhost";
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
    const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
    return `${proto}://${host}`;
  }

  async function cookieOptions() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: isSecureRequest(await appOrigin()),
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    };
  }

  async function readSession(
    store?: CookieStore,
  ): Promise<ServerSession | null> {
    const jar = store ?? (await cookies());
    return server().unseal(jar.get(server().cookieName)?.value);
  }

  // Only Server Functions and Route Handlers can set cookies.
  async function persist(session: ServerSession | null) {
    const jar = await cookies();
    if (session)
      jar.set(
        server().cookieName,
        await server().seal(session),
        await cookieOptions(),
      );
    else jar.delete(server().cookieName);
  }

  async function canWrite(jar: CookieStore, value: string): Promise<boolean> {
    try {
      jar.set(server().cookieName, value, await cookieOptions());
      return true;
    } catch {
      return false;
    }
  }

  const link = async (redirectTo: string | undefined, path: string) =>
    redirectTo ?? new URL(path, await appOrigin()).href;

  return {
    get server() {
      return server();
    },

    /** `export const { GET, POST } = exwave.routeHandlers()` in `app/api/exwave/[...action]/route.ts`. */
    routeHandlers() {
      const handler = async (
        request: Request,
        context: { params: Promise<{ action?: string[] }> },
      ) => {
        const { action = [] } = await context.params;
        return handleAuthRequest(server(), request, action.join("/"), {
          links: paths,
        });
      };
      return { GET: handler, POST: handler };
    },

    /** The signed-in player from the cookie, or `null`. Safe in Server Components. */
    async getPlayer(): Promise<Player | null> {
      return (await readSession())?.player ?? null;
    },

    async getSession(): Promise<NextSession | null> {
      const session = await readSession();
      if (!session) return null;
      const { player, accessToken, expiresAt } = session;
      return { player, accessToken, expiresAt };
    },

    /**
     * A PAT with at least 60 s left. Server Functions and Route Handlers
     * refresh and store the rotated cookie. Server Components cannot set
     * cookies, so they never refresh (a lost rotation would end the session):
     * they rely on `proxy` and get `null` once the PAT has expired.
     */
    async getPlayerAccessToken(): Promise<string | null> {
      const jar = await cookies();
      const raw = jar.get(server().cookieName)?.value;
      const session = await readSession(jar);
      if (!session || !raw) return null;
      const now = server().now();
      if (session.expiresAt - now > REFRESH_MARGIN_MS)
        return session.accessToken;
      if (!(await canWrite(jar, raw)))
        return session.expiresAt > now ? session.accessToken : null;
      let result: RefreshResult;
      try {
        result = await server().refreshSession(session);
      } catch {
        return session.expiresAt > now ? session.accessToken : null;
      }
      if (result.cookie === "write" || result.cookie === "clear")
        await persist(result.session);
      return result.session?.accessToken ?? null;
    },

    signUp: async (input: SignUpInput): Promise<SignUpResult> =>
      server().signUp({
        ...input,
        redirectTo: await link(input.redirectTo, paths.verifyEmail),
      }),
    resendVerification: async (input: EmailInput) =>
      server().resendVerification({
        ...input,
        redirectTo: await link(input.redirectTo, paths.verifyEmail),
      }),
    resetPassword: async (input: EmailInput) =>
      server().resetPassword({
        ...input,
        redirectTo: await link(input.redirectTo, paths.resetPassword),
      }),
    async signIn(input: SignInInput): Promise<Player> {
      const session = await server().signIn(input);
      await persist(session);
      return session.player;
    },
    async verifyEmail(input: CodeInput): Promise<Player> {
      const session = await server().verifyEmail(input);
      await persist(session);
      return session.player;
    },
    async confirmPasswordReset(
      input: PasswordResetConfirmInput,
    ): Promise<Player> {
      const session = await server().confirmPasswordReset(input);
      await persist(session);
      return session.player;
    },
    async signOut({ everywhere = false } = {}) {
      const session = await readSession();
      try {
        if (session) await server().signOut(session, { everywhere });
      } catch (error) {
        if (everywhere) throw error;
      } finally {
        await persist(null);
      }
    },

    /**
     * For `proxy.ts`: refreshes a session whose PAT has under 60 s left, so
     * pages render with a fresh PAT and the browser gets the rotated cookie.
     */
    async proxy(request: NextRequest): Promise<NextResponse> {
      const name = server().cookieName;
      const value = request.cookies.get(name)?.value;
      if (!value) return NextResponse.next();
      const session = await server().unseal(value);
      let result: RefreshResult | null = null;
      if (session) {
        try {
          result = await server().refreshSession(session);
        } catch {
          // Auth unreachable: keep the cookie and let the page decide.
          return NextResponse.next();
        }
        if (result.cookie === "keep") return NextResponse.next();
      }
      const sealed = result?.session
        ? await server().seal(result.session)
        : null;
      // Hand the fresh session to this render through the request cookies.
      if (sealed) request.cookies.set(name, sealed);
      else request.cookies.delete(name);
      const response = NextResponse.next({
        request: { headers: request.headers },
      });
      const secure = isSecureRequest(request.url);
      if (sealed && result?.cookie === "write")
        response.cookies.set(name, sealed, {
          httpOnly: true,
          sameSite: "lax",
          secure,
          path: "/",
          maxAge: COOKIE_MAX_AGE_SECONDS,
        });
      else if (!sealed) response.cookies.delete(name);
      return response;
    },
  };
}

export type ExwaveNext = ReturnType<typeof createExwaveNext>;

/** Shorthand: `export const { GET, POST } = exwaveRouteHandlers()`. */
export function exwaveRouteHandlers(options?: ExwaveNextOptions) {
  return createExwaveNext(options).routeHandlers();
}
