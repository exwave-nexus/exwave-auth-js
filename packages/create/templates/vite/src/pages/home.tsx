import { useExwave } from "@exwave-nexus/auth/react";
import { Button } from "@/components/ui/button";

export function HomePage() {
  const { user, navigate } = useExwave();
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">
        {user ? `Welcome back, ${user.displayName}` : "Welcome"}
      </h1>
      <p className="text-muted-foreground">
        Sign-up, sign-in, email verification and password reset, with Exwave
        Auth, from the browser.
      </p>
      <div className="flex gap-2">
        {user ? (
          <Button onClick={() => navigate("/account")}>Your account</Button>
        ) : (
          <>
            <Button onClick={() => navigate("/sign-up")}>
              Create an account
            </Button>
            <Button variant="outline" onClick={() => navigate("/sign-in")}>
              Sign in
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
