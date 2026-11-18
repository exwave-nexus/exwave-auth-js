// An in-memory stand-in for the Exwave player API (exwave-auth v0.7.0,
// `/orbit/v1/platforms/:platformId/…`), so the examples run before production
// has it. Email links are printed to the console instead of being sent.
//
//   bun run mock            # http://localhost:4010
//   MOCK_PAT_TTL=120 bun run mock   # shorter PATs, to watch refreshes
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { encodePublishableKey } from "../packages/auth/src/publishable-key";

export const MOCK_PLATFORM_ID = "6f1c2a10-5a3e-4c2b-9d4e-0a1b2c3d4e5f";
export const MOCK_PORT = 4010;
export const SEED_PLAYERS = [
  {
    email: "player@example.com",
    username: "player1",
    password: "Password123!",
    displayName: "Test Player",
    emailVerified: true,
  },
  {
    email: "unverified@example.com",
    username: "unverified",
    password: "Password123!",
    displayName: "Unverified Player",
    emailVerified: false,
  },
];

const PAT_ISSUER = "exwave-auth";
const PAT_AUDIENCE = "exwave-player-services";
const GRACE_MS = 30_000;
const IDLE_MS = 30 * 24 * 3600_000;
const ABSOLUTE_MS = 90 * 24 * 3600_000;
const FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const CODE_TTL_MS = 60 * 60_000;

interface User {
  userId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  username: string | null;
  password: string;
  status: "active" | "locked";
  verifyCode?: { code: string; expiresAt: number };
  resetCode?: { code: string; expiresAt: number };
}

interface MockSession {
  id: string;
  userId: string;
  tokenHash: string;
  previousHash: string | null;
  rotatedAt: number;
  createdAt: number;
  lastUsedAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  revokedAt: number | null;
  revokeReason: string | null;
}

export interface SentEmail {
  to: string;
  kind: "verify_email" | "password_reset";
  link: string;
  code: string;
  userId: string;
}

/** Zitadel's default complexity policy, which a new platform gets in production. */
export const DEFAULT_PASSWORD_POLICY = {
  min_length: 8,
  requires_uppercase: true,
  requires_lowercase: true,
  requires_number: true,
  requires_symbol: true,
};

export type MockPasswordPolicy = typeof DEFAULT_PASSWORD_POLICY;

export interface MockAuthOptions {
  origin?: string;
  platformId?: string;
  patTtlSeconds?: number;
  signUpEnabled?: boolean;
  passwordPolicy?: Partial<MockPasswordPolicy>;
  siteUrl?: string;
  allowedRedirectOrigins?: string[];
  now?: () => number;
  log?: (line: string) => void;
  seed?: boolean;
}

type Body = Record<string, unknown>;

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const newRefreshToken = () => `exw_rt_${randomBytes(32).toString("base64url")}`;
const newCode = () =>
  Array.from(
    randomBytes(6),
    (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32],
  ).join("");
const newUserId = () =>
  `3${Array.from(randomBytes(17), (b) => String(b % 10)).join("")}`;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Content-Type, Authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-max-age": "600",
  // As Auth's /orbit/v1 policy (PR #12): browsers can read Retry-After.
  "access-control-expose-headers": "Retry-After",
};

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, { status, headers: { ...CORS, ...headers } });
}
const error = (
  code: string,
  status: number,
  headers?: Record<string, string>,
) => json({ error: code }, status, headers);
const empty = (status: number) => new Response(null, { status, headers: CORS });

// As Auth's meetsPasswordPolicy(): code points, and Zitadel's ASCII classes.
function weakPassword(password: string, policy: MockPasswordPolicy) {
  return !(
    [...password].length >= policy.min_length &&
    (!policy.requires_uppercase || /[A-Z]/.test(password)) &&
    (!policy.requires_lowercase || /[a-z]/.test(password)) &&
    (!policy.requires_number || /[0-9]/.test(password)) &&
    (!policy.requires_symbol || /[^A-Za-z0-9]/.test(password))
  );
}

export async function createMockAuth(options: MockAuthOptions = {}) {
  const origin = options.origin ?? `http://localhost:${MOCK_PORT}`;
  const platformId = options.platformId ?? MOCK_PLATFORM_ID;
  const now = options.now ?? Date.now;
  const log = options.log ?? console.log;
  const settings = {
    patTtlSeconds: options.patTtlSeconds ?? 900,
    signUpEnabled: options.signUpEnabled ?? true,
    passwordPolicy: { ...DEFAULT_PASSWORD_POLICY, ...options.passwordPolicy },
  };
  const siteUrl = options.siteUrl ?? "http://localhost:5173/";
  const allowedOrigins = options.allowedRedirectOrigins ?? [
    "http://localhost:5173",
    "http://localhost:3000",
  ];
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
    extractable: true,
  });
  const kid = "mock-ed25519-1";
  const jwks = {
    keys: [{ ...(await exportJWK(publicKey)), kid, alg: "EdDSA", use: "sig" }],
  };
  const users = new Map<string, User>();
  const sessions: MockSession[] = [];
  const failures = new Map<string, number[]>();
  const emails: SentEmail[] = [];
  const organizationId = "290000000000000001";

  function addUser(input: Omit<User, "userId" | "status">): User {
    const user: User = {
      ...input,
      userId: newUserId(),
      status: "active",
    };
    users.set(user.userId, user);
    return user;
  }

  if (options.seed ?? true)
    for (const seed of SEED_PLAYERS) addUser({ ...seed });

  const findByEmail = (email: string) =>
    [...users.values()].find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    );
  const findByLogin = (login: string) =>
    findByEmail(login) ??
    [...users.values()].find(
      (u) => u.username?.toLowerCase() === login.toLowerCase(),
    );

  // Auth's player ID is the PAT subject.
  const subject = (u: User) =>
    `managed:${platformId}:${encodeURIComponent(u.userId)}`;
  const apiPlayer = (u: User) => ({
    id: subject(u),
    user_id: u.userId,
    email: u.email,
    email_verified: u.emailVerified,
    display_name: u.displayName,
    username: u.username,
  });

  async function pat(user: User) {
    const iat = Math.floor(now() / 1000);
    return new SignJWT({
      project_id: platformId,
      organization_id: organizationId,
      auth_method: "managed",
      token_use: "player_access",
      jti: randomUUID(),
    })
      .setProtectedHeader({ alg: "EdDSA", kid, typ: "JWT" })
      .setIssuer(PAT_ISSUER)
      .setAudience(PAT_AUDIENCE)
      .setSubject(subject(user))
      .setIssuedAt(iat)
      .setExpirationTime(iat + settings.patTtlSeconds)
      .sign(privateKey);
  }

  async function tokens(user: User, refreshToken: string | null) {
    return json({
      access_token: await pat(user),
      token_type: "Bearer",
      expires_in: settings.patTtlSeconds,
      refresh_token: refreshToken,
      player: apiPlayer(user),
    });
  }

  async function startSession(user: User) {
    const refreshToken = newRefreshToken();
    const t = now();
    sessions.push({
      id: randomUUID(),
      userId: user.userId,
      tokenHash: sha256(refreshToken),
      previousHash: null,
      rotatedAt: t,
      createdAt: t,
      lastUsedAt: t,
      idleExpiresAt: t + IDLE_MS,
      absoluteExpiresAt: t + ABSOLUTE_MS,
      revokedAt: null,
      revokeReason: null,
    });
    return tokens(user, refreshToken);
  }

  function revokeAll(userId: string, reason: string) {
    for (const s of sessions)
      if (s.userId === userId && !s.revokedAt) {
        s.revokedAt = now();
        s.revokeReason = reason;
      }
  }

  function redirectTarget(value: unknown): URL | "invalid" {
    if (value === undefined || value === null) return new URL(siteUrl);
    if (typeof value !== "string") return "invalid";
    try {
      const url = new URL(value);
      // Zitadel's link template holds 200 characters, placeholders included.
      const template = `${url.href}?exwave_verify={{.Code}}&uid={{.UserID}}`;
      const ok =
        (url.protocol === "http:" || url.protocol === "https:") &&
        allowedOrigins.includes(url.origin) &&
        template.length <= 200;
      return ok ? url : "invalid";
    } catch {
      return "invalid";
    }
  }

  function sendEmail(user: User, kind: SentEmail["kind"], target: URL): void {
    const code = newCode();
    const entry = { code, expiresAt: now() + CODE_TTL_MS };
    if (kind === "verify_email") user.verifyCode = entry;
    else user.resetCode = entry;
    const url = new URL(target);
    url.searchParams.set(
      kind === "verify_email" ? "exwave_verify" : "exwave_reset",
      code,
    );
    url.searchParams.set("uid", user.userId);
    emails.push({
      to: user.email,
      kind,
      link: url.href,
      code,
      userId: user.userId,
    });
    const subject =
      kind === "verify_email" ? "Verify your email" : "Reset your password";
    log(`\n  ✉  To ${user.email}: ${subject}\n     ${url.href}\n`);
  }

  function checkCode(
    user: User | undefined,
    kind: "verifyCode" | "resetCode",
    code: unknown,
  ) {
    const entry = user?.[kind];
    return !!entry && entry.code === code && entry.expiresAt > now();
  }

  function hitFailure(key: string) {
    const list = (failures.get(key) ?? []).filter(
      (t) => t > now() - FAILURE_WINDOW_MS,
    );
    list.push(now());
    failures.set(key, list);
  }
  function retryAfter(key: string): number {
    const list = (failures.get(key) ?? []).filter(
      (t) => t > now() - FAILURE_WINDOW_MS,
    );
    failures.set(key, list);
    if (list.length < MAX_FAILURES) return 0;
    return Math.ceil(((list[0] ?? now()) + FAILURE_WINDOW_MS - now()) / 1000);
  }

  // Wrong codes: 10 per 15 minutes per user, like failed sign-ins.
  function codeLimited(userId: unknown) {
    const wait = retryAfter(`code:${String(userId)}`);
    return wait > 0
      ? error("rate_limited", 429, { "retry-after": String(wait) })
      : null;
  }

  const str = (v: unknown, max = 256) =>
    typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

  async function platformRoute(method: string, path: string, request: Request) {
    const body: Body =
      method === "POST"
        ? (((await request.json().catch(() => null)) as Body | null) ?? {})
        : {};

    switch (`${method} ${path}`) {
      case "GET config":
        return json(
          {
            platform_id: platformId,
            sign_up_enabled: settings.signUpEnabled,
            password_policy: settings.passwordPolicy,
            allowed_redirect_origins: allowedOrigins,
            oidc: {
              issuer: "http://localhost:4010/mock-zitadel",
              client_id: "mock-client-id@exwave",
              scopes: ["openid", "profile", "email", "offline_access"],
            },
            jwks_uri: `${origin}/orbit/v1/jwks`,
          },
          200,
          { "cache-control": "public, max-age=60" },
        );

      case "POST players/sign-up": {
        if (!settings.signUpEnabled) return error("sign_up_disabled", 403);
        const email = str(body.email);
        const password = str(body.password, 128);
        const displayName = str(body.display_name, 64);
        const username =
          body.username === undefined ? null : str(body.username, 32);
        const target = redirectTarget(body.redirect_to);
        if (!email?.includes("@") || !password || !displayName)
          return error("invalid_request", 400);
        if (
          body.username !== undefined &&
          !/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(username ?? "")
        )
          return error("invalid_request", 400);
        if (target === "invalid") return error("invalid_redirect_to", 400);
        // Auth checks the policy before looking the player up.
        if (weakPassword(password, settings.passwordPolicy))
          return error("weak_password", 422);
        if (findByEmail(email)) return error("email_taken", 409);
        if (username && findByLogin(username))
          return error("username_taken", 409);
        const user = addUser({
          email,
          password,
          displayName,
          username,
          emailVerified: false,
        });
        sendEmail(user, "verify_email", target);
        return json({ user_id: user.userId, verification: "email_sent" }, 201);
      }

      case "POST players/verify-email": {
        const user = users.get(String(body.user_id));
        const limited = codeLimited(body.user_id);
        if (limited) return limited;
        if (!user || !checkCode(user, "verifyCode", body.code)) {
          hitFailure(`code:${String(body.user_id)}`);
          return error("invalid_code", 400);
        }
        user.emailVerified = true;
        user.verifyCode = undefined;
        if (user.status === "locked") return error("player_locked", 403);
        return startSession(user);
      }

      case "POST players/verify-email/resend": {
        const target = redirectTarget(body.redirect_to);
        if (target === "invalid") return error("invalid_redirect_to", 400);
        const user = findByEmail(String(body.email ?? ""));
        if (user && !user.emailVerified)
          sendEmail(user, "verify_email", target);
        return json({}, 202);
      }

      case "POST players/sign-in": {
        const login = str(body.login);
        const password = str(body.password, 128);
        if (!login || !password) return error("invalid_request", 400);
        const key = `${platformId}:${login.toLowerCase()}`;
        const wait = retryAfter(key);
        if (wait > 0)
          return error("rate_limited", 429, { "retry-after": String(wait) });
        const user = findByLogin(login);
        if (!user || user.password !== password) {
          hitFailure(key);
          return error("invalid_credentials", 401);
        }
        failures.delete(key);
        if (user.status === "locked") return error("player_locked", 403);
        if (!user.emailVerified) return error("email_not_verified", 403);
        return startSession(user);
      }

      case "POST players/token/refresh": {
        const token = str(body.refresh_token, 512);
        if (!token) return error("invalid_request", 400);
        const hash = sha256(token);
        const current = sessions.find((s) => s.tokenHash === hash);
        const previous = current
          ? undefined
          : sessions.find((s) => s.previousHash === hash);
        const session = current ?? previous;
        if (!session) return error("invalid_refresh_token", 401);
        const user = users.get(session.userId);
        if (!user) return error("invalid_refresh_token", 401);
        // Locking revokes sessions, but the player should hear why.
        if (user.status === "locked") return error("player_locked", 403);
        const t = now();
        if (
          session.revokedAt ||
          session.idleExpiresAt <= t ||
          session.absoluteExpiresAt <= t
        )
          return error("invalid_refresh_token", 401);
        if (previous) {
          if (t - session.rotatedAt <= GRACE_MS) return tokens(user, null);
          // Reuse after the grace window: someone holds a stolen token.
          session.revokedAt = t;
          session.revokeReason = "refresh_token_reuse";
          log(`  ⚠  Refresh token reuse: session ${session.id} revoked`);
          return error("invalid_refresh_token", 401);
        }
        const next = newRefreshToken();
        session.previousHash = session.tokenHash;
        session.tokenHash = sha256(next);
        session.rotatedAt = t;
        session.lastUsedAt = t;
        session.idleExpiresAt = Math.min(
          t + IDLE_MS,
          session.absoluteExpiresAt,
        );
        return tokens(user, next);
      }

      case "POST players/sign-out": {
        const token = str(body.refresh_token, 512);
        if (token) {
          const hash = sha256(token);
          const session = sessions.find(
            (s) => s.tokenHash === hash || s.previousHash === hash,
          );
          if (session && body.everywhere === true)
            revokeAll(session.userId, "sign_out_everywhere");
          else if (session && !session.revokedAt) {
            session.revokedAt = now();
            session.revokeReason = "sign_out";
          }
        }
        return empty(204);
      }

      case "POST players/password-reset": {
        const target = redirectTarget(body.redirect_to);
        if (target === "invalid") return error("invalid_redirect_to", 400);
        const user = findByEmail(String(body.email ?? ""));
        if (user) sendEmail(user, "password_reset", target);
        return json({}, 202);
      }

      case "POST players/password-reset/confirm": {
        const user = users.get(String(body.user_id));
        const password = str(body.password, 128);
        const limited = codeLimited(body.user_id);
        if (limited) return limited;
        if (!password) return error("invalid_request", 400);
        // As Auth: the policy first, so a weak password keeps the code usable.
        if (weakPassword(password, settings.passwordPolicy))
          return error("weak_password", 422);
        if (!user || !checkCode(user, "resetCode", body.code)) {
          hitFailure(`code:${String(body.user_id)}`);
          return error("invalid_code", 400);
        }
        user.password = password;
        user.resetCode = undefined;
        // The link reached the inbox, so the address is proven.
        user.emailVerified = true;
        revokeAll(user.userId, "password_reset");
        if (user.status === "locked") return error("player_locked", 403);
        return startSession(user);
      }

      case "GET players/me": {
        const header = request.headers.get("authorization") ?? "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : "";
        try {
          const { payload } = await jwtVerify(token, publicKey, {
            issuer: PAT_ISSUER,
            audience: PAT_AUDIENCE,
            currentDate: new Date(now()),
          });
          const userId = decodeURIComponent(
            String(payload.sub).split(":")[2] ?? "",
          );
          const user = users.get(userId);
          if (!user || payload.project_id !== platformId) throw new Error();
          return json(apiPlayer(user));
        } catch {
          return error("unauthorized", 401);
        }
      }
    }
    return error("not_found", 404);
  }

  // Mock-only controls, for tests and for trying error states by hand.
  function adminRoute(method: string, path: string) {
    if (method === "GET" && path === "players")
      return json(
        [...users.values()].map((u) => ({
          ...apiPlayer(u),
          status: u.status,
          sessions: sessions.filter(
            (s) => s.userId === u.userId && !s.revokedAt,
          ).length,
        })),
      );
    if (method === "GET" && path === "emails") return json(emails);
    const match = /^players\/([^/]+)\/(lock|unlock)$/.exec(path);
    if (method === "POST" && match) {
      const [, ref, action] = match;
      const user = users.get(ref ?? "") ?? findByLogin(ref ?? "");
      if (!user) return error("not_found", 404);
      user.status = action === "lock" ? "locked" : "active";
      if (action === "lock") revokeAll(user.userId, "player_locked");
      log(`  🔒 ${user.email} is now ${user.status}`);
      return json(apiPlayer(user));
    }
    return error("not_found", 404);
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return empty(204);
    if (url.pathname === "/orbit/v1/jwks") return json(jwks);
    if (url.pathname.startsWith("/__mock/"))
      return adminRoute(request.method, url.pathname.slice("/__mock/".length));
    const match = /^\/orbit\/v1\/platforms\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (!match) return error("not_found", 404);
    if (match[1]?.toLowerCase() !== platformId)
      return error("managed_auth_not_enabled", 404);
    return platformRoute(request.method, match[2] ?? "", request);
  }

  async function fetchHandler(request: Request): Promise<Response> {
    const response = await handle(request);
    if (request.method !== "OPTIONS")
      log(
        `  ${request.method} ${new URL(request.url).pathname} → ${response.status}`,
      );
    return response;
  }

  return {
    origin,
    platformId,
    publishableKey: encodePublishableKey({ authOrigin: origin, platformId }),
    settings,
    emails,
    sessions,
    fetch: fetchHandler,
    lock: (ref: string) => adminRoute("POST", `players/${ref}/lock`),
    unlock: (ref: string) => adminRoute("POST", `players/${ref}/unlock`),
    /** A `fetch` that calls this mock in-process, for tests. */
    fetcher: (): typeof fetch =>
      (async (input: RequestInfo | URL, init?: RequestInit) =>
        fetchHandler(new Request(input, init))) as typeof fetch,
  };
}

export type MockAuth = Awaited<ReturnType<typeof createMockAuth>>;

if (import.meta.main) {
  const port = Number(process.env.MOCK_AUTH_PORT ?? MOCK_PORT);
  const mock = await createMockAuth({
    origin: `http://localhost:${port}`,
    patTtlSeconds: Number(process.env.MOCK_PAT_TTL ?? 900),
  });
  // Both loopbacks: "localhost" resolves to either, depending on the client.
  for (const hostname of ["127.0.0.1", "::1"])
    Bun.serve({ port, hostname, fetch: (request) => mock.fetch(request) });
  console.log(`
  Exwave mock auth  ${mock.origin}   (PATs last ${mock.settings.patTtlSeconds} s)

  Publishable key   ${mock.publishableKey}
    examples/vite-spa      VITE_EXWAVE_PUBLISHABLE_KEY=…
    examples/next-server   NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY=…
    (both are already in each example's .env.development)

  Password policy   ${JSON.stringify(mock.settings.passwordPolicy)}
    (Zitadel's default; createMockAuth({ passwordPolicy }) changes it)

  Test players (password ${SEED_PLAYERS[0]?.password})
    ${SEED_PLAYERS.map((p) => `${p.email} / ${p.username}${p.emailVerified ? "" : "  (email not verified)"}`).join("\n    ")}

  Mock controls
    curl ${mock.origin}/__mock/players
    curl -X POST ${mock.origin}/__mock/players/player1/lock     (and /unlock)
    curl ${mock.origin}/__mock/emails
`);
}
