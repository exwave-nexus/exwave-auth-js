// The route client: the same calls as the browser client, made to your own
// server's `/api/exwave/*` routes (`handleAuthRequest`, or Next.js's
// `routeHandlers()`). The session lives in the server's httpOnly cookie, so
// this client never holds a refresh token.
import {
  type AuthChangeEvent,
  type AuthChangeInfo,
  type AuthChangeListener,
  CONFIG_TTL_MS,
  type ExwaveAuthClient,
  REFRESH_MARGIN_MS,
  type SignOutReason,
  toSignOutReason,
} from "./client";
import { parseEmailLink } from "./email-link";
import { ExwaveAuthError, isExwaveAuthError } from "./errors";
import type { PasswordRule } from "./password";
import type {
  AuthState,
  CodeInput,
  EmailInput,
  EmailLink,
  PasswordResetConfirmInput,
  PlatformConfig,
  Session,
  SignInInput,
  SignUpInput,
  SignUpResult,
  User,
} from "./types";

interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

/** Platform hooks. Tests replace them; apps never need to. */
export interface RouteRuntime {
  now(): number;
  channel(name: string): ChannelLike | undefined;
  onVisible(callback: () => void): (() => void) | undefined;
}

export interface ExwaveRouteClientOptions {
  /** Where the auth routes are mounted. Default `/api/exwave`. */
  api?: string;
  /**
   * The server's view of the session, such as `await exwave.getAuthState()`
   * in a Next.js layout, so the first render needs no request.
   */
  initialState?: AuthState;
  fetch?: typeof fetch;
  /** @internal */
  runtime?: Partial<RouteRuntime>;
}

/** The route client. Its sessions never carry a PAT: `accessToken` is `null`. */
export interface ExwaveRouteClient extends ExwaveAuthClient {
  readonly mode: "route";
  readonly api: string;
  /**
   * Takes the server's newer view of the session (after `router.refresh()`,
   * say) without a request. Changes it brings are reported with
   * `info.source: "server"`.
   */
  hydrate(state: AuthState): void;
}

type TabMessage =
  | { type: "SIGNED_IN"; session: Session }
  | { type: "SIGNED_OUT"; reason: SignOutReason };

type Json = Record<string, unknown>;

function defaultRuntime(): RouteRuntime {
  const browser = typeof window !== "undefined";
  return {
    now: () => Date.now(),
    channel: (name) =>
      browser && typeof BroadcastChannel === "function"
        ? (new BroadcastChannel(name) as unknown as ChannelLike)
        : undefined,
    onVisible(callback) {
      if (!browser || typeof document === "undefined") return undefined;
      const onChange = () => {
        if (document.visibilityState === "visible") callback();
      };
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
  };
}

const toSession = (
  state: Pick<AuthState, "user" | "expiresAt"> | null | undefined,
): Session | null =>
  state?.user
    ? { user: state.user, accessToken: null, expiresAt: state.expiresAt }
    : null;

export function createExwaveRouteClient(
  options: ExwaveRouteClientOptions = {},
): ExwaveRouteClient {
  const api = (options.api ?? "/api/exwave").replace(/\/+$/, "");
  const rt: RouteRuntime = { ...defaultRuntime(), ...options.runtime };
  const listeners = new Set<AuthChangeListener>();
  const linkFlights = new Map<string, Promise<Session>>();
  let session = toSession(options.initialState);
  let lastReason: SignOutReason | undefined =
    options.initialState?.signOutReason ?? undefined;
  let config: { at: number; value: Promise<PlatformConfig> } | undefined;
  let token: { value: string; expiresAt: number } | undefined;
  let started: Promise<void> | undefined;
  let channel: ChannelLike | undefined;
  let offVisible: (() => void) | undefined;
  let closed = false;

  async function call<T>(
    method: "GET" | "POST",
    action: string,
    body?: Json,
  ): Promise<T> {
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(`${api}/${action}`, {
        method,
        headers: body ? { "content-type": "application/json" } : {},
        body: body && JSON.stringify(body),
        credentials: "same-origin",
      });
    } catch {
      throw new ExwaveAuthError("network_error");
    }
    if (response.status === 202 || response.status === 204)
      return undefined as T;
    const data = (await response.json().catch(() => null)) as Json | null;
    if (!response.ok) {
      const retryAfter =
        Number(response.headers.get("retry-after")) || undefined;
      const code =
        typeof data?.error === "string"
          ? data.error
          : response.status === 401
            ? "unauthorized"
            : "unavailable";
      const failedRules = Array.isArray(data?.failedRules)
        ? (data.failedRules as PasswordRule[])
        : undefined;
      throw new ExwaveAuthError(code, response.status, retryAfter, failedRules);
    }
    if (!data) throw new ExwaveAuthError("invalid_response", response.status);
    return data as T;
  }

  function emit(event: AuthChangeEvent, info: AuthChangeInfo = {}) {
    for (const listener of [...listeners]) {
      try {
        listener(event, session, info);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  function setSession(
    next: Session | null,
    event?: AuthChangeEvent,
    info: AuthChangeInfo = {},
  ) {
    if (next?.user.id !== session?.user.id) token = undefined;
    session = next;
    lastReason = info.reason;
    if (event) emit(event, info);
  }

  function signedIn(state: { user: User; expiresAt: number | null }) {
    const next = toSession(state) as Session;
    setSession(next, "SIGNED_IN");
    channel?.postMessage({
      type: "SIGNED_IN",
      session: next,
    } satisfies TabMessage);
    return next;
  }

  function end(reason: SignOutReason) {
    channel?.postMessage({ type: "SIGNED_OUT", reason } satisfies TabMessage);
    if (session) setSession(null, "SIGNED_OUT", { reason });
    else lastReason = reason;
  }

  // A newer view of the session: report what changed, quietly take the rest.
  function apply(state: AuthState, info: AuthChangeInfo) {
    const next = toSession(state);
    if (next && session && next.user.id === session.user.id) {
      session = next;
      return;
    }
    if (!next && !session) {
      lastReason = state.signOutReason ?? lastReason;
      return;
    }
    if (next) setSession(next, "SIGNED_IN", info);
    else
      setSession(null, "SIGNED_OUT", {
        ...info,
        reason: state.signOutReason ?? "signed_out",
      });
  }

  // Nothing runs until first use, so server rendering makes no requests.
  function start(): Promise<void> {
    started ??= (async () => {
      channel = rt.channel(`exwave-auth:${api}`);
      if (channel)
        channel.onmessage = ({ data }) => {
          const message = data as TabMessage;
          if (message.type === "SIGNED_OUT") {
            if (session)
              setSession(null, "SIGNED_OUT", { reason: message.reason });
          } else if (session?.user.id === message.session.user.id)
            session = message.session;
          else setSession(message.session, "SIGNED_IN");
        };
      offVisible = rt.onVisible(() => {
        call<AuthState>("GET", "session").then(
          (state) => apply(state, {}),
          () => undefined,
        );
      });
      if (options.initialState) return;
      try {
        const state = await call<AuthState>("GET", "session");
        session = toSession(state);
        lastReason = state.signOutReason ?? undefined;
      } catch {
        // Unreachable server: signed out until a call says otherwise.
      }
    })();
    return started;
  }

  const client: ExwaveRouteClient = {
    mode: "route",
    api,
    async signUp(input: SignUpInput): Promise<SignUpResult> {
      return call("POST", "sign-up", {
        email: input.email,
        password: input.password,
        displayName: input.displayName,
        username: input.username || undefined,
        redirectTo: input.redirectTo,
      });
    },
    async verifyEmail(input: CodeInput) {
      await start();
      return signedIn(await call("POST", "verify-email", { ...input }));
    },
    async handleEmailLink(url): Promise<EmailLink | null> {
      const href = url ?? globalThis.location?.href;
      const link = href ? parseEmailLink(href) : null;
      if (!link) return null;
      const { userId, code } = link;
      if (link.type === "reset")
        return { type: "password_reset", userId, code };
      // Codes work once: share one call between repeated handlers (React Strict Mode).
      let flight = linkFlights.get(code);
      if (!flight) {
        flight = client.verifyEmail({ userId, code });
        linkFlights.set(code, flight);
        flight.catch(() => linkFlights.delete(code));
      }
      return { type: "email_verified", session: await flight };
    },
    resendVerification: (input: EmailInput) =>
      call("POST", "verify-email/resend", { ...input }),
    async signIn(input: SignInInput) {
      await start();
      return signedIn(await call("POST", "sign-in", { ...input }));
    },
    async signOut({ everywhere = false } = {}) {
      await start();
      try {
        await call("POST", "sign-out", { everywhere });
      } catch (error) {
        // The server answered, so it cleared the cookie: this device is out.
        // Everywhere needs the API too, so say it failed.
        if (isExwaveAuthError(error) && error.status > 0) end("signed_out");
        throw error;
      }
      end(everywhere ? "signed_out_everywhere" : "signed_out");
    },
    resetPassword: (input: EmailInput) =>
      call("POST", "password-reset", { ...input }),
    async confirmPasswordReset(input: PasswordResetConfirmInput) {
      await start();
      return signedIn(
        await call("POST", "password-reset/confirm", { ...input }),
      );
    },
    async getPlayerAccessToken() {
      await start();
      if (token && token.expiresAt - rt.now() > REFRESH_MARGIN_MS)
        return token.value;
      try {
        const body = await call<{ access_token: string; expires_in: number }>(
          "GET",
          "token",
        );
        token = {
          value: body.access_token,
          expiresAt: rt.now() + body.expires_in * 1000,
        };
        return token.value;
      } catch (error) {
        if (isExwaveAuthError(error)) {
          // No cookie: the session ended without this page noticing.
          if (error.code === "not_signed_in") {
            if (session)
              setSession(null, "SIGNED_OUT", {
                reason: "invalid_refresh_token",
              });
            return null;
          }
          const reason = toSignOutReason(error.code);
          if (reason) end(reason);
        }
        throw error;
      }
    },
    async getSession() {
      await start();
      return session;
    },
    onAuthStateChange(listener) {
      let active = true;
      start().then(() => {
        if (!active || closed) return;
        listeners.add(listener);
        listener("INITIAL_SESSION", session, { reason: lastReason });
      });
      return () => {
        active = false;
        listeners.delete(listener);
      };
    },
    getConfig() {
      if (!config || rt.now() - config.at > CONFIG_TTL_MS) {
        const value = call<PlatformConfig>("GET", "config");
        config = { at: rt.now(), value };
        value.catch(() => {
          config = undefined;
        });
      }
      return config.value;
    },
    hydrate(state) {
      apply(state, { source: "server" });
    },
    close() {
      closed = true;
      listeners.clear();
      channel?.close();
      offVisible?.();
    },
  };
  return client;
}
