"use client";

import { useExwave } from "@exwave-nexus/auth/react";
import type { ComponentProps, MouseEvent } from "react";

/** A link between auth pages that moves the way your app does (the provider's `navigate`). */
export function AuthLink({
  href,
  onClick,
  ...props
}: ComponentProps<"a"> & { href: string }) {
  const { navigate } = useExwave();
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target
    )
      return;
    event.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={follow} {...props} />;
}

/** `?redirect=/path` from the address bar when it stays on this site, else `fallback`. */
export function redirectTarget(fallback: string): string {
  if (typeof location === "undefined") return fallback;
  const to = new URLSearchParams(location.search).get("redirect");
  return to?.startsWith("/") && !to.startsWith("//") && !to.startsWith("/\\")
    ? to
    : fallback;
}
