"use client";

import { useRouter } from "next/navigation";
import {
  type ExwaveProviderSettings,
  ExwaveProvider as Provider,
} from "../react";
import type { AuthState } from "../types";

export interface ExwaveNextProviderProps
  extends Omit<ExwaveProviderSettings, "navigate" | "onAuthChange"> {
  /** Where `routeHandlers()` is mounted. Default `/api/exwave`. */
  api?: string;
  /** `await exwave.getAuthState()`, from the layout, on every server render. */
  initialState?: AuthState;
}

/**
 * `<ExwaveProvider>` for the Next.js App Router: it talks to your
 * `/api/exwave` routes, moves between pages with the router, and refreshes
 * Server Components when someone signs in or out.
 *
 * ```tsx
 * // app/layout.tsx
 * <ExwaveProvider initialState={await exwave.getAuthState()}>{children}</ExwaveProvider>
 * ```
 */
export function ExwaveProvider({
  api = "/api/exwave",
  ...props
}: ExwaveNextProviderProps) {
  const router = useRouter();
  return (
    <Provider
      {...props}
      api={api}
      navigate={(to, options) =>
        options?.replace ? router.replace(to) : router.push(to)
      }
      onAuthChange={() => router.refresh()}
    />
  );
}
