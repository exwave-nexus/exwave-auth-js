import {
  ArrowRight,
  Blocks,
  BookOpen,
  LayoutDashboard,
  User,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BackendNotice } from "@/components/exwave/backend-notice";
import { SignOutButton } from "@/components/exwave/sign-out-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { exwave } from "@/lib/exwave";

const LINKS = [
  {
    href: "https://www.exwave.net/docs/auth/get-started/",
    title: "Auth guide",
    description: "Sessions, server checks and every hook, step by step.",
    icon: BookOpen,
  },
  {
    href: "https://www.exwave.net/docs/auth/components/",
    title: "Components",
    description: "Every screen as a shadcn/ui component, to add one by one.",
    icon: Blocks,
  },
  {
    href: "https://nexus.exwave.net/",
    title: "Nexus",
    description: "Your users, sign-up settings, emails and Redirect URLs.",
    icon: LayoutDashboard,
  },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase())
    .join("") || "?";

export default async function HomePage() {
  const user = await exwave.getUser();
  return (
    <main className="flex min-h-svh flex-col items-center gap-10 overflow-x-hidden px-6 pt-26 pb-18">
      <div className="flex max-w-2xl flex-col items-center gap-5 text-center">
        <div className="relative size-28">
          <svg
            aria-hidden="true"
            viewBox="0 0 480 480"
            fill="none"
            stroke="currentColor"
            className="pointer-events-none absolute top-1/2 left-1/2 size-120 -translate-1/2 text-primary dark:text-accent-foreground"
          >
            <circle cx="240" cy="240" r="88" strokeOpacity="0.28" />
            <circle cx="240" cy="240" r="132" strokeOpacity="0.16" />
            <circle cx="240" cy="240" r="180" strokeOpacity="0.09" />
            <circle cx="240" cy="240" r="232" strokeOpacity="0.05" />
          </svg>
          <Image
            src="/exwave.svg"
            alt="Exwave"
            width={112}
            height={112}
            priority
            className="relative drop-shadow-[0_0_36px_rgb(0_111_167/0.25)] dark:drop-shadow-[0_0_36px_rgb(33_182_243/0.4)]"
          />
        </div>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Exwave Auth{" "}
          <span className="font-semibold text-muted-foreground">+</span>{" "}
          shadcn/ui
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Sign-up, sign-in, email verification and password reset, built from
          shadcn/ui components in Exwave’s colors. Every screen is a file in
          your app, yours to change.
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <Card aria-label="Your session">
          <CardContent className="flex flex-col gap-5 px-6 py-2">
            {user ? (
              <>
                <div className="flex items-center gap-3.5">
                  <Avatar className="size-11">
                    <AvatarFallback className="bg-accent font-extrabold text-accent-foreground">
                      {initials(user.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-base font-bold">
                      Signed in as {user.displayName}
                    </p>
                    <p className="text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <p className="text-muted-foreground">
                  This page read your session on the server, with{" "}
                  <code>exwave.getUser()</code>.
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Button asChild className="h-11 text-[15px] font-bold">
                    <Link href="/account">Your account</Link>
                  </Button>
                  <SignOutButton className="h-11 text-[15px] font-bold" />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3.5">
                  <Avatar className="size-11">
                    <AvatarFallback>
                      <User className="size-5 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-base font-bold">You’re signed out</p>
                    <p className="text-muted-foreground">
                      Create an account or sign in, and your session shows up
                      here.
                    </p>
                  </div>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Button asChild className="h-11 text-[15px] font-bold">
                    <Link href="/sign-up">Create an account</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-11 text-[15px] font-bold"
                  >
                    <Link href="/sign-in">Sign in</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <BackendNotice />
      </div>

      <p className="text-center text-muted-foreground">
        Get started by editing{" "}
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm text-foreground">
          app/page.tsx
        </code>
      </p>

      <nav
        aria-label="Learn more"
        className="grid w-full max-w-4xl gap-4 sm:grid-cols-3"
      >
        {LINKS.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-shadow group-hover:ring-primary">
              <CardContent className="flex flex-col gap-2 px-5">
                <span className="flex items-center gap-2.5 text-base font-extrabold">
                  <Icon className="size-4.5 text-primary dark:text-accent-foreground" />
                  {title}
                  <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="text-muted-foreground">{description}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </nav>
    </main>
  );
}
