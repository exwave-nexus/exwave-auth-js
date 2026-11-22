"use client";

import { useExwave, useSignOut } from "@exwave-nexus/auth/react";
import type { ComponentProps } from "react";

/** Signs out here, or on every device with `everywhere`, then goes to `paths.afterSignOut`. */
export function SignOutButton({
  everywhere = false,
  className = "button button-outline",
  children,
  ...props
}: ComponentProps<"button"> & { everywhere?: boolean }) {
  const { navigate, paths } = useExwave();
  const signOut = useSignOut();
  return (
    <button
      type="button"
      className={className}
      disabled={signOut.pending}
      title={signOut.message ?? undefined}
      onClick={async () => {
        await signOut.run({ everywhere });
        navigate(paths.afterSignOut, { replace: true });
      }}
      {...props}
    >
      {children ?? (everywhere ? "Sign out everywhere" : "Sign out")}
    </button>
  );
}
