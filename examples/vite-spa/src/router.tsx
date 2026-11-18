// A few lines of History API routing, so the example needs no router package.
import { type MouseEvent, type ReactNode, useSyncExternalStore } from "react";

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

export function Link({ to, children }: { to: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  );
}
