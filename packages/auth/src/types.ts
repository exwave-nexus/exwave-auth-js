/** The signed-in user, as the Auth API describes them, in camelCase. */
export interface User {
  /** Exwave's ID for the user: the player access token's subject, `managed:<platform id>:<user id>`. */
  id: string;
  /** The identity provider's (Zitadel) user ID: the `uid` in email links. */
  userId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  username: string | null;
}

export interface Session {
  user: User;
  /** The player access token (PAT). `null` until the first refresh after a reload. */
  accessToken: string | null;
  /** When the PAT expires, in milliseconds since the epoch. */
  expiresAt: number | null;
}

export interface PasswordPolicy {
  minLength?: number;
  requiresUppercase?: boolean;
  requiresLowercase?: boolean;
  requiresNumber?: boolean;
  requiresSymbol?: boolean;
}

export interface PlatformConfig {
  platformId: string;
  signUpEnabled: boolean;
  passwordPolicy: PasswordPolicy;
  allowedRedirectOrigins: string[];
  oidc: { issuer: string; clientId: string; scopes: string[] };
  jwksUri: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  username?: string;
  /** Where the verification link lands. Defaults to the platform's Site URL. */
  redirectTo?: string;
}

export interface SignUpResult {
  userId: string;
  verification: "email_sent";
}

export interface SignInInput {
  /** Email or username. */
  login: string;
  password: string;
}

export interface EmailInput {
  email: string;
  redirectTo?: string;
}

export interface CodeInput {
  userId: string;
  code: string;
}

export interface PasswordResetConfirmInput extends CodeInput {
  password: string;
}

/** What `handleEmailLink()` found in the URL. */
export type EmailLink =
  | { type: "email_verified"; session: Session }
  | { type: "password_reset"; userId: string; code: string };

/** Claims of a player access token. Decoding does not verify them. */
export interface PlayerAccessTokenClaims {
  iss: string;
  aud: string | string[];
  /** `managed:<platform id>:<user id>` for managed auth. */
  sub: string;
  project_id: string;
  organization_id?: string;
  auth_method?: string;
  token_use?: string;
  iat: number;
  exp: number;
  jti?: string;
  [claim: string]: unknown;
}
