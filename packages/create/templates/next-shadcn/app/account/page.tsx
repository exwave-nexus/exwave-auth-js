import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/exwave/sign-out-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { exwave } from "@/lib/exwave";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase())
    .join("") || "?";

export default async function AccountPage() {
  const user = await exwave.getUser();
  if (!user) redirect("/sign-in?redirect=/account");

  return (
    <main className="min-h-svh bg-muted/50 dark:bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 pt-16 pb-18">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">Your account</h1>

        <Card aria-label="Profile" className="gap-0 py-0">
          <div className="flex items-center gap-4 p-6">
            <Avatar className="size-16">
              <AvatarFallback className="bg-accent text-xl font-extrabold text-accent-foreground">
                {initials(user.displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-xl font-extrabold">{user.displayName}</p>
              {user.username && (
                <p className="text-[15px] text-muted-foreground">
                  @{user.username}
                </p>
              )}
            </div>
          </div>
          <dl className="divide-y border-t">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-4">
              <dt className="w-30 font-semibold text-muted-foreground">
                Email
              </dt>
              <dd className="flex flex-1 flex-wrap items-center gap-2.5 text-[15px]">
                {user.email}
                {user.emailVerified ? (
                  <Badge className="bg-accent text-accent-foreground">
                    <Check />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary">Not verified</Badge>
                )}
              </dd>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-4">
              <dt className="w-30 font-semibold text-muted-foreground">
                Username
              </dt>
              <dd className="flex-1 text-[15px]">{user.username ?? "—"}</dd>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-4">
              <dt className="w-30 font-semibold text-muted-foreground">
                User ID
              </dt>
              <dd className="min-w-0 flex-1 font-mono text-[13px] break-all">
                {user.id}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2.5 border-t bg-muted/50 px-6 py-5">
            <SignOutButton className="h-11 bg-card px-4 text-[15px] font-bold" />
            <SignOutButton
              everywhere
              variant="ghost"
              className="h-11 px-3 text-[15px] font-bold"
            />
            <p className="flex-1 basis-48 text-muted-foreground">
              Everywhere also ends your sessions on your other devices.
            </p>
          </div>
        </Card>

        <p className="text-muted-foreground">
          Edit this page in{" "}
          <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm text-foreground">
            app/account/page.tsx
          </code>
        </p>
      </div>
    </main>
  );
}
