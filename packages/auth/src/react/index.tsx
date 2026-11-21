"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AuthChangeEvent,
  createExwaveAuth,
  type ExwaveAuth,
  type ExwaveAuthOptions,
  type SignOutReason,
} from "../client";
import type { Messages } from "../messages";
import {
  createExwaveRouteClient,
  type ExwaveRouteClient,
} from "../route-client";
import type { AuthState, Session, User } from "../types";

/** Where the auth pages live, and where to go after signing in and out. */
export interface ExwavePaths {
  signIn: string;
  signUp: string;
  forgotPassword: string;
  /** Password reset emails land here. */
  resetPassword: string;
  /** Verification emails land here. */
  verifyEmail: string;
  afterSignIn: string;
  afterSignOut: string;
}

export const DEFAULT_PATHS: ExwavePaths = {
  signIn: "/sign-in",
  signUp: "/sign-up",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyEmail: "/verify",
  afterSignIn: "/",
  afterSignOut: "/",
};

export type Navigate = (to: string, options?: { replace?: boolean }) => void;

/** Either client: check `auth.mode` before using what only one of them has. */
export type ExwaveClient = ExwaveAuth | ExwaveRouteClient;

export interface ExwaveContextValue {
  auth: ExwaveClient;
  /** `false` until the session is known: read from storage, the server or `initialState`. */
  isLoaded: boolean;
  isSignedIn: boolean;
  session: Session | null;
  user: User | null;
  /** The last auth event, such as `TOKEN_REFRESHED`. */
  event: AuthChangeEvent | null;
  /**
   * Why the user is signed out, such as `account_locked`: set by `SIGNED_OUT`,
   * or on load when the session ended in the last 5 minutes. `null` while
   * signed in.
   */
  signOutReason: SignOutReason | null;
  /** Your overrides of `defaultMessages` (`@exwave-nexus/auth/messages`). */
  messages: Messages | undefined;
  paths: ExwavePaths;
  navigate: Navigate;
}

const ExwaveContext = createContext<ExwaveContextValue | null>(null);

export interface ExwaveProviderSettings {
  children: ReactNode;
  messages?: Messages;
  paths?: Partial<ExwavePaths>;
  /** How hooks and components move between pages. Default: a full page load. */
  navigate?: Navigate;
  /**
   * Called on `SIGNED_IN` and `SIGNED_OUT` from this page or another tab,
   * never for changes the server reported (`initialState`), so it can
   * re-render server content without looping.
   */
  onAuthChange?: (event: AuthChangeEvent, session: Session | null) => void;
}

export type ExwaveProviderProps = ExwaveProviderSettings &
  (
    | (ExwaveAuthOptions & { api?: undefined; client?: undefined })
    | {
        /** Where your server's auth routes are mounted, such as `/api/exwave`. */
        api: string;
        /** The server's view of the session; pass a fresh one on every server render. */
        initialState?: AuthState;
        client?: undefined;
      }
    | { client: ExwaveClient; initialState?: AuthState; api?: undefined }
  );

const defaultNavigate: Navigate = (to, options) => {
  if (options?.replace) location.replace(to);
  else location.assign(to);
};

function createClient(props: ExwaveProviderProps): ExwaveClient {
  if (props.client) return props.client;
  if (props.api !== undefined)
    return createExwaveRouteClient({
      api: props.api,
      initialState: props.initialState,
    });
  return createExwaveAuth(props as ExwaveAuthOptions);
}

/**
 * Keeps the session in React state for hooks and components. Give it your
 * publishable key (the browser talks to Exwave Auth), `api` (your server's
 * `/api/exwave` routes keep the session in a cookie), or a client.
 */
export function ExwaveProvider(props: ExwaveProviderProps) {
  const { children, messages, paths, navigate, onAuthChange } = props;
  const initialState = "initialState" in props ? props.initialState : undefined;
  const [auth] = useState(() => createClient(props));
  const [state, setState] = useState<{
    isLoaded: boolean;
    session: Session | null;
    event: AuthChangeEvent | null;
    signOutReason: SignOutReason | null;
  }>(() => ({
    isLoaded: initialState !== undefined,
    session: initialState?.user
      ? {
          user: initialState.user,
          accessToken: null,
          expiresAt: initialState.expiresAt,
        }
      : null,
    event: null,
    signOutReason: initialState?.signOutReason ?? null,
  }));

  // Callbacks change on every render; read the latest from refs.
  const latest = useRef({ navigate, onAuthChange });
  latest.current = { navigate, onAuthChange };

  useEffect(
    () =>
      auth.onAuthStateChange((event, session, info) => {
        setState({
          isLoaded: true,
          session,
          event,
          // INITIAL_SESSION carries it too, when a reload found the session ended.
          signOutReason: info.reason ?? null,
        });
        if (
          (event === "SIGNED_IN" || event === "SIGNED_OUT") &&
          info.source !== "server"
        )
          latest.current.onAuthChange?.(event, session);
      }),
    [auth],
  );

  // A server render brings a fresh view of the session: take it quietly.
  useEffect(() => {
    if (initialState && auth.mode === "route") auth.hydrate(initialState);
  }, [auth, initialState]);

  const stableNavigate = useMemo<Navigate>(
    () => (to, options) =>
      (latest.current.navigate ?? defaultNavigate)(to, options),
    [],
  );
  const mergedPaths = useMemo(() => ({ ...DEFAULT_PATHS, ...paths }), [paths]);

  const value = useMemo<ExwaveContextValue>(
    () => ({
      auth,
      ...state,
      isSignedIn: state.session !== null,
      user: state.session?.user ?? null,
      messages,
      paths: mergedPaths,
      navigate: stableNavigate,
    }),
    [auth, state, messages, mergedPaths, stableNavigate],
  );
  return (
    <ExwaveContext.Provider value={value}>{children}</ExwaveContext.Provider>
  );
}

export function useExwave(): ExwaveContextValue {
  const value = useContext(ExwaveContext);
  if (!value)
    throw new Error("useExwave() must be used inside <ExwaveProvider>");
  return value;
}
