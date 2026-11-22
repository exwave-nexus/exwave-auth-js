"use client";

import { useExwave, useSignOut } from "@exwave-nexus/auth-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

/** Signs out here, or on every device with `everywhere`, then goes to `paths.afterSignOut`. */
export function SignOutButton({
  everywhere = false,
  children,
  ...props
}: ComponentProps<typeof Button> & { everywhere?: boolean }) {
  const { navigate, paths } = useExwave();
  const signOut = useSignOut();
  return (
    <Button
      variant="outline"
      disabled={signOut.pending}
      title={signOut.message ?? undefined}
      onClick={async () => {
        await signOut.run({ everywhere });
        navigate(paths.afterSignOut, { replace: true });
      }}
      {...props}
    >
      {children ?? (everywhere ? "Sign out everywhere" : "Sign out")}
    </Button>
  );
}
