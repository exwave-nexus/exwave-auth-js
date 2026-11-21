import { useExwave } from "@exwave-nexus/auth/react";
import { useEffect } from "react";
import { SignOutButton } from "@/components/exwave/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AccountPage() {
  const { isLoaded, user, navigate } = useExwave();

  useEffect(() => {
    if (isLoaded && !user)
      navigate("/sign-in?redirect=/account", { replace: true });
  }, [isLoaded, user, navigate]);
  if (!user) return null;

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">{user.displayName}</CardTitle>
        <CardDescription>
          {user.email} {user.emailVerified ? "(verified)" : "(not verified)"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Username</dt>
          <dd>{user.username ?? "—"}</dd>
          <dt className="text-muted-foreground">User ID</dt>
          <dd className="break-all">{user.id}</dd>
        </dl>
        <div className="flex gap-2">
          <SignOutButton />
          <SignOutButton everywhere variant="ghost" />
        </div>
      </CardContent>
    </Card>
  );
}
