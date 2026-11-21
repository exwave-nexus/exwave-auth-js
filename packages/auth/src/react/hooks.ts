// Headless hooks: the state and calls behind sign-in, sign-up, email links,
// password reset and sign-out, for your own markup. They work the same with
// the browser client and the route client.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type EmailLinkParams,
  parseEmailLink,
  withoutEmailLink,
} from "../email-link";
import { describeError, describeRule } from "../messages";
import { checkPassword, type PasswordRule, passwordRules } from "../password";
import type {
  CodeInput,
  PasswordPolicy,
  PlatformConfig,
  Session,
  SignInInput,
  SignUpInput,
  SignUpResult,
} from "../types";
import { useExwave } from "./provider";

/** One call's state. `run` never throws: read `error` or `message` instead. */
export interface Action<A extends unknown[], R> {
  run(...args: A): Promise<R | undefined>;
  pending: boolean;
  error: unknown;
  /** What to show for `error`, from `@exwave-nexus/auth/messages` and your overrides. */
  message: string | null;
  reset(): void;
}

/** Wraps any call in an `Action`. The hooks below are built on it. */
export function useAction<A extends unknown[], R>(
  call: (...args: A) => Promise<R>,
  options: { policy?: PasswordPolicy | null } = {},
): Action<A, R> {
  const { messages } = useExwave();
  const latest = useRef(call);
  latest.current = call;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [state, setState] = useState<{ pending: boolean; error: unknown }>({
    pending: false,
    error: null,
  });

  const run = useCallback(async (...args: A) => {
    setState({ pending: true, error: null });
    try {
      const result = await latest.current(...args);
      if (mounted.current) setState({ pending: false, error: null });
      return result;
    } catch (error) {
      if (mounted.current) setState({ pending: false, error });
      return undefined;
    }
  }, []);
  const reset = useCallback(
    () => setState({ pending: false, error: null }),
    [],
  );

  return {
    run,
    reset,
    pending: state.pending,
    error: state.error,
    message: state.error
      ? describeError(state.error, { policy: options.policy, messages })
      : null,
  };
}

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];
let warnedOrigin: string | undefined;

/**
 * Email links can only land on the Site URL or a Redirect URL. Catch the
 * usual first-run problem: developing on localhost before adding it.
 */
function warnAboutOrigin(config: PlatformConfig) {
  if (typeof location === "undefined") return;
  const { origin, hostname } = location;
  if (!LOOPBACK.includes(hostname) || warnedOrigin === origin) return;
  if (config.allowedRedirectOrigins.includes(origin)) return;
  warnedOrigin = origin;
  console.warn(
    `@exwave-nexus/auth: ${origin} isn't a Site URL or Redirect URL of this platform, so email links can't land here. Add it in Nexus → Auth → Settings → Redirect URLs.`,
  );
}

/** The platform's config (sign-up, password policy…), or `null` while it loads. */
export function usePlatformConfig(): PlatformConfig | null {
  const { auth } = useExwave();
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  useEffect(() => {
    let active = true;
    auth.getConfig().then(
      (value) => {
        warnAboutOrigin(value);
        if (active) setConfig(value);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [auth]);
  return config;
}

export function usePasswordPolicy(): PasswordPolicy | null {
  return usePlatformConfig()?.passwordPolicy ?? null;
}

export interface PasswordCheck {
  /** Every rule of the policy, ticked off as the password meets it. */
  rules: { rule: PasswordRule; ok: boolean; label: string }[];
  failed: PasswordRule[];
  valid: boolean;
}

/** Checks a password against the policy as it is typed, for a rules list. */
export function usePasswordCheck(
  password: string,
  policy: PasswordPolicy | null,
): PasswordCheck {
  const { messages } = useExwave();
  const failed = policy ? checkPassword(password, policy) : [];
  const rules = policy
    ? passwordRules(policy).map((rule) => ({
        rule,
        ok: !failed.includes(rule),
        label: describeRule(rule, { policy, messages }),
      }))
    : [];
  return { rules, failed, valid: failed.length === 0 };
}

/** An email link's URL for this page's origin; the route client's server picks its own. */
function useLinkTo() {
  const { auth } = useExwave();
  return useCallback(
    (path: string) =>
      auth.mode === "browser" && typeof location !== "undefined"
        ? new URL(path, location.origin).href
        : undefined,
    [auth],
  );
}

export function useSignIn(): Action<[SignInInput], Session> & {
  /** Set when the email isn't verified yet, to offer a new link. */
  unverifiedEmail: string | null;
} {
  const { auth } = useExwave();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const action = useAction(async (input: SignInInput) => {
    setUnverifiedEmail(null);
    try {
      return await auth.signIn(input);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "email_not_verified" && input.login.includes("@"))
        setUnverifiedEmail(input.login);
      throw error;
    }
  });
  return { ...action, unverifiedEmail };
}

export function useResendVerification(
  email: string | null,
): Action<[], void> & { sent: boolean } {
  const { auth, paths } = useExwave();
  const linkTo = useLinkTo();
  const [sent, setSent] = useState(false);
  const action = useAction(async () => {
    if (!email) return;
    setSent(false);
    await auth.resendVerification({
      email,
      redirectTo: linkTo(paths.verifyEmail),
    });
    setSent(true);
  });
  return { ...action, sent };
}

export function useSignUp() {
  const { auth, paths } = useExwave();
  const linkTo = useLinkTo();
  const policy = usePasswordPolicy();
  const [email, setEmail] = useState<string | null>(null);
  const signUp = useAction(
    async (input: Omit<SignUpInput, "redirectTo">): Promise<SignUpResult> => {
      const result = await auth.signUp({
        ...input,
        redirectTo: linkTo(paths.verifyEmail),
      });
      setEmail(input.email);
      return result;
    },
    { policy },
  );
  const resend = useResendVerification(email);
  return {
    /** `"check_email"` once the verification link is on its way. */
    step: email ? ("check_email" as const) : ("form" as const),
    email,
    policy,
    signUp,
    resend,
    /** Back to the form, to fix the email address. */
    back: () => {
      setEmail(null);
      signUp.reset();
      resend.reset();
    },
  };
}

export function usePasswordReset() {
  const { auth, paths } = useExwave();
  const linkTo = useLinkTo();
  const policy = usePasswordPolicy();
  const [sent, setSent] = useState(false);
  const request = useAction(async (email: string) => {
    setSent(false);
    await auth.resetPassword({
      email,
      redirectTo: linkTo(paths.resetPassword),
    });
    setSent(true);
  });
  const confirm = useAction(
    (link: CodeInput, password: string) =>
      auth.confirmPasswordReset({ ...link, password }),
    { policy },
  );
  return { request: { ...request, sent }, confirm, policy };
}

export type EmailLinkStatus =
  | { status: "loading" }
  | { status: "none" }
  | { status: "verified"; session: Session }
  | { status: "reset"; userId: string; code: string }
  | { status: "error"; error: unknown; message: string };

/**
 * Handles the email link this page was opened with: verifies the email (and
 * signs in) or hands back the password reset code. Runs in an effect, so link
 * scanners that don't run JavaScript can't use the code up, and only once
 * under React Strict Mode. Removes the code from the address bar.
 */
export function useEmailLink(
  options: { url?: string; clean?: boolean } = {},
): EmailLinkStatus {
  const { auth, messages } = useExwave();
  const [status, setStatus] = useState<EmailLinkStatus>({ status: "loading" });
  // Strict Mode runs the effect twice; the second run sees a cleaned URL.
  const found = useRef<{ href: string; link: EmailLinkParams | null } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    if (!found.current) {
      const href = options.url ?? location.href;
      found.current = { href, link: parseEmailLink(href) };
      if (found.current.link && options.clean !== false && !options.url)
        history.replaceState(history.state, "", withoutEmailLink(href));
    }
    const { href, link } = found.current;
    if (!link) setStatus({ status: "none" });
    else if (link.type === "reset")
      setStatus({ status: "reset", userId: link.userId, code: link.code });
    else
      auth.handleEmailLink(href).then(
        (result) => {
          if (active && result?.type === "email_verified")
            setStatus({ status: "verified", session: result.session });
        },
        (error: unknown) => {
          if (active)
            setStatus({
              status: "error",
              error,
              message: describeError(error, { messages }),
            });
        },
      );
    return () => {
      active = false;
    };
  }, [auth, messages, options.url, options.clean]);

  return status;
}

export function useSignOut(): Action<
  [options?: { everywhere?: boolean }],
  void
> {
  const { auth } = useExwave();
  return useAction((options?: { everywhere?: boolean }) =>
    auth.signOut(options),
  );
}
