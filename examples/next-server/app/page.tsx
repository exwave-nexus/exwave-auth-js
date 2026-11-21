import Link from "next/link";
import { exwave } from "@/lib/exwave";

export default async function HomePage() {
  const user = await exwave.getUser();
  return (
    <section className="card">
      <h1>Exwave Auth, on the server</h1>
      <p>
        The Next.js server talks to the Exwave Auth API. The browser only holds
        a sealed, httpOnly session cookie; the refresh token never reaches it.
      </p>
      {user ? (
        <p>
          Signed in as <strong>{user.displayName}</strong>.{" "}
          <Link href="/account">Open your account</Link>.
        </p>
      ) : (
        <p className="row">
          <Link href="/sign-in">Sign in</Link>
          <Link href="/sign-up">Create an account</Link>
        </p>
      )}
    </section>
  );
}
