import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/exwave/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { exwave } from "@/lib/exwave";

export default async function AccountPage() {
  const user = await exwave.getUser();
  if (!user) redirect("/sign-in?redirect=/account");

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
