// A few lines of History API routing, so the app needs no router package.
// Swap in yours: give the provider its navigate function.
import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  addEventListener("popstate", onChange);
  return () => removeEventListener("popstate", onChange);
};

export function navigate(to: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => location.pathname);
}
