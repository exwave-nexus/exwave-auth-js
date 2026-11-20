import Link from "next/link";
import { Button } from "@/components/ui/button";
import { exwave } from "@/lib/exwave";

export default async function HomePage() {
  const user = await exwave.getUser();
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">
        {user ? `Welcome back, ${user.displayName}` : "Welcome"}
      </h1>
      <p className="text-muted-foreground">
        Sign-up, sign-in, email verification and password reset, with Exwave
        Auth. The session lives in an httpOnly cookie; this page reads it on the
        server.
      </p>
      <div className="flex gap-2">
        {user ? (
          <Button asChild>
            <Link href="/account">Your account</Link>
          </Button>
        ) : (
          <>
            <Button asChild>
              <Link href="/sign-up">Create an account</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
