"use client";

import { useExwave, useSignOut } from "@exwave-nexus/auth-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "?";

/** "Sign in" when signed out; the user's menu when signed in. */
export function UserButton({
  accountHref = "/account",
}: {
  accountHref?: string;
}) {
  const { isLoaded, user, navigate, paths } = useExwave();
  const signOut = useSignOut();

  if (!isLoaded) return null;
  if (!user)
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate(paths.signIn)}
      >
        Sign in
      </Button>
    );

  const leave = async (everywhere: boolean) => {
    await signOut.run({ everywhere });
    navigate(paths.afterSignOut, { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Your account"
        >
          <Avatar>
            <AvatarFallback>{initials(user.displayName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {/* Base UI menus need the label in a group, and only fire onClick
            (Radix fires it on keyboard selection too), so this works in both. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span>{user.displayName}</span>
            <span className="text-muted-foreground text-xs font-normal">
              {user.email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(accountHref)}>
          Account
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => leave(false)}>
          Sign out
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => leave(true)}>
          Sign out everywhere
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
