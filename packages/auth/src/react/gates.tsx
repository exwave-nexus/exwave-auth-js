import type { ReactNode } from "react";
import { useExwave } from "./provider";

/** Renders its children once the session is known and someone is signed in. */
export function SignedIn({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useExwave();
  return isLoaded && isSignedIn ? children : null;
}

/** Renders its children once the session is known and nobody is signed in. */
export function SignedOut({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useExwave();
  return isLoaded && !isSignedIn ? children : null;
}
