"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type AuthChangeEvent,
  createExwaveAuth,
  type ExwaveAuth,
  type ExwaveAuthOptions,
  type SignOutReason,
} from "../client";
import type { Session, User } from "../types";

export interface ExwaveContextValue {
  auth: ExwaveAuth;
  /** `false` until the stored session has been read (and refreshed). */
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
}

const ExwaveContext = createContext<ExwaveContextValue | null>(null);

export type ExwaveProviderProps =
  | ({ children: ReactNode; client?: undefined } & ExwaveAuthOptions)
  | { children: ReactNode; client: ExwaveAuth };

/** Creates the client once (or takes yours) and keeps the session in React state. */
export function ExwaveProvider({ children, ...props }: ExwaveProviderProps) {
  const [auth] = useState(() =>
    props.client ? props.client : createExwaveAuth(props as ExwaveAuthOptions),
  );
  const [state, setState] = useState<{
    isLoaded: boolean;
    session: Session | null;
    event: AuthChangeEvent | null;
    signOutReason: SignOutReason | null;
  }>({ isLoaded: false, session: null, event: null, signOutReason: null });

  useEffect(
    () =>
      auth.onAuthStateChange((event, session, info) =>
        setState({
          isLoaded: true,
          session,
          event,
          // INITIAL_SESSION carries it too, when a reload found the session ended.
          signOutReason: info.reason ?? null,
        }),
      ),
    [auth],
  );

  const value = useMemo<ExwaveContextValue>(
    () => ({
      auth,
      ...state,
      isSignedIn: state.session !== null,
      user: state.session?.user ?? null,
    }),
    [auth, state],
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
