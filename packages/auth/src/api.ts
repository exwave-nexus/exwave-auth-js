import { ExwaveAuthError, isExwaveAuthError } from "./errors";
import { checkPassword } from "./password";
import { decodePublishableKey } from "./publishable-key";
import type {
  CodeInput,
  EmailInput,
  PasswordResetConfirmInput,
  PlatformConfig,
  SignInInput,
  SignUpInput,
  SignUpResult,
  User,
} from "./types";

type Json = Record<string, unknown>;

// Wire shapes of the player API (snake_case). Internal: the public types are camelCase.
export interface ApiPlayer {
  id: string;
  user_id: string;
  email: string;
  email_verified: boolean;
  display_name: string;
  username?: string | null;
}

export interface ApiTokens {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  /** `null` when an already-rotated token was replayed inside the grace window. */
  refresh_token: string | null;
  player: ApiPlayer;
}

/**
 * The player API under `/orbit/v1/platforms/:platformId/`, with no state. The
 * browser client and the server helpers both sit on top of it.
 */
export function createPlayerApi(
  publishableKey: string,
  fetcher?: typeof fetch,
) {
  const { authOrigin, platformId } = decodePublishableKey(publishableKey);
  const base = `${authOrigin}/orbit/v1/platforms/${platformId}/`;

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    body?: Json,
    token?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    let response: Response;
    try {
      response = await (fetcher ?? fetch)(base + path, {
        method,
        headers,
        body: body && JSON.stringify(body),
        credentials: "omit",
      });
    } catch {
      throw new ExwaveAuthError("network_error");
    }
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
      throw new ExwaveAuthError(code, response.status, retryAfter);
    }
    if (response.status === 202 || response.status === 204)
      return undefined as T;
    if (!data) throw new ExwaveAuthError("invalid_response", response.status);
    return data as T;
  }

  const tokens = (path: string, body: Json) =>
    call<ApiTokens>("POST", path, body);
  const links = (input: EmailInput) => ({
    email: input.email,
    redirect_to: input.redirectTo,
  });
  const config = async () => toConfig(await call<Json>("GET", "config"));

  // The API answers `weak_password` alone: name the broken rules from a fresh
  // policy (it may have changed since the form read it).
  async function checked<T>(password: string, run: Promise<T>): Promise<T> {
    try {
      return await run;
    } catch (error) {
      if (!isExwaveAuthError(error) || error.code !== "weak_password")
        throw error;
      const policy = await config().then(
        (c) => c.passwordPolicy,
        () => ({}),
      );
      throw new ExwaveAuthError(
        error.code,
        error.status,
        undefined,
        checkPassword(password, policy),
      );
    }
  }

  return {
    authOrigin,
    platformId,
    config,
    async signUp(input: SignUpInput): Promise<SignUpResult> {
      const result = await checked(
        input.password,
        call<{ user_id: string; verification: "email_sent" }>(
          "POST",
          "players/sign-up",
          {
            email: input.email,
            password: input.password,
            display_name: input.displayName,
            username: input.username || undefined,
            redirect_to: input.redirectTo,
          },
        ),
      );
      return { userId: result.user_id, verification: result.verification };
    },
    verifyEmail: (input: CodeInput) =>
      tokens("players/verify-email", {
        user_id: input.userId,
        code: input.code,
      }),
    resendVerification: (input: EmailInput) =>
      call<void>("POST", "players/verify-email/resend", links(input)),
    signIn: (input: SignInInput) =>
      tokens("players/sign-in", {
        login: input.login,
        password: input.password,
      }),
    refresh: (refreshToken: string) =>
      tokens("players/token/refresh", { refresh_token: refreshToken }),
    signOut: (refreshToken: string, everywhere = false) =>
      call<void>("POST", "players/sign-out", {
        refresh_token: refreshToken,
        everywhere,
      }),
    resetPassword: (input: EmailInput) =>
      call<void>("POST", "players/password-reset", links(input)),
    confirmPasswordReset: (input: PasswordResetConfirmInput) =>
      checked(
        input.password,
        tokens("players/password-reset/confirm", {
          user_id: input.userId,
          code: input.code,
          password: input.password,
        }),
      ),
    async me(accessToken: string): Promise<User> {
      const data = await call<{ player?: ApiPlayer } & ApiPlayer>(
        "GET",
        "players/me",
        undefined,
        accessToken,
      );
      // Auth answers with the bare player; accept a wrapped one too.
      return toUser(data.player ?? data);
    },
  };
}

export type PlayerApi = ReturnType<typeof createPlayerApi>;

export function toUser(p: ApiPlayer): User {
  return {
    id: p.id,
    userId: p.user_id,
    email: p.email,
    emailVerified: p.email_verified,
    displayName: p.display_name,
    username: p.username ?? null,
  };
}

function toConfig(c: Json): PlatformConfig {
  const policy = (c.password_policy ?? {}) as Json;
  const oidc = (c.oidc ?? {}) as Json;
  const scopes = oidc.scopes;
  return {
    platformId: c.platform_id as string,
    signUpEnabled: c.sign_up_enabled === true,
    passwordPolicy: {
      minLength: policy.min_length as number | undefined,
      requiresUppercase: policy.requires_uppercase as boolean | undefined,
      requiresLowercase: policy.requires_lowercase as boolean | undefined,
      requiresNumber: policy.requires_number as boolean | undefined,
      requiresSymbol: policy.requires_symbol as boolean | undefined,
    },
    allowedRedirectOrigins: (c.allowed_redirect_origins as string[]) ?? [],
    oidc: {
      issuer: oidc.issuer as string,
      clientId: oidc.client_id as string,
      scopes: Array.isArray(scopes)
        ? scopes
        : String(scopes ?? "")
            .split(" ")
            .filter(Boolean),
    },
    jwksUri: c.jwks_uri as string,
  };
}

/** Decodes a JWT payload without verifying it, for display and expiry math. */
export function decodeJwtPayload<T = Json>(token: string): T {
  const part = token.split(".")[1];
  if (!part) throw new ExwaveAuthError("invalid_token");
  try {
    const binary = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new ExwaveAuthError("invalid_token");
  }
}
