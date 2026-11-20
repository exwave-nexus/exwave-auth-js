import { decodePlayerAccessToken } from "@exwave-nexus/auth";
import { redirect } from "next/navigation";
import { exwave } from "@/lib/exwave";
import { SignOutButtons, TokenPanel } from "../forms";

export default async function AccountPage() {
  const session = await exwave.getSession();
  if (!session) redirect("/sign-in");
  // Server Components never refresh; proxy.ts already did if it was due.
  const accessToken = await exwave.getPlayerAccessToken();
  // players/me, called from the server with the PAT.
  const user = accessToken
    ? await exwave.server.getUser(accessToken).catch(() => session.user)
    : session.user;
  const claims = decodePlayerAccessToken(session.accessToken);

  return (
    <>
      <section className="card">
        <h1>{user.displayName}</h1>
        <dl>
          <dt>Email</dt>
          <dd>
            {user.email} {user.emailVerified ? "✓ verified" : "(not verified)"}
          </dd>
          <dt>Username</dt>
          <dd>{user.username ?? "—"}</dd>
          <dt>Exwave ID</dt>
          <dd>{user.id}</dd>
          <dt>User ID</dt>
          <dd>{user.userId}</dd>
        </dl>
      </section>
      <TokenPanel expiresAt={session.expiresAt} />
      <section className="card">
        <h2>Claims</h2>
        <pre>{JSON.stringify(claims, null, 2)}</pre>
      </section>
      <SignOutButtons />
    </>
  );
}
