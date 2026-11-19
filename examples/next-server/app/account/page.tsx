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
  const player = accessToken
    ? await exwave.server.getPlayer(accessToken).catch(() => session.player)
    : session.player;
  const claims = decodePlayerAccessToken(session.accessToken);

  return (
    <>
      <section className="card">
        <h1>{player.displayName}</h1>
        <dl>
          <dt>Email</dt>
          <dd>
            {player.email}{" "}
            {player.emailVerified ? "✓ verified" : "(not verified)"}
          </dd>
          <dt>Username</dt>
          <dd>{player.username ?? "—"}</dd>
          <dt>Player ID</dt>
          <dd>{player.id}</dd>
          <dt>User ID</dt>
          <dd>{player.userId}</dd>
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
