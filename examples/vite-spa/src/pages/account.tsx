import { decodePlayerAccessToken, type User } from "@exwave-nexus/auth";
import { useExwave } from "@exwave-nexus/auth/react";
import { useEffect, useState } from "react";
import { describeError } from "../errors";
import { navigate } from "../router";

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function AccountPage() {
  const { auth, session, event } = useExwave();
  const now = useNow();
  const [api, setApi] = useState<{ user?: User; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) navigate("/sign-in", { replace: true });
  }, [session]);
  if (!session) return null;

  const { user, accessToken, expiresAt } = session;
  const claims = accessToken ? decodePlayerAccessToken(accessToken) : null;

  // "Protected API": players/me on Exwave Auth, called with the PAT.
  const callApi = async () => {
    setBusy(true);
    try {
      setApi({ user: await auth.getUser() });
    } catch (error) {
      setApi({ error: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  const signOut = async (everywhere: boolean) => {
    setSignOutError(null);
    try {
      await auth.signOut({ everywhere });
    } catch (error) {
      setSignOutError(describeError(error));
    }
  };

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

      <section className="card">
        <h2>Player access token</h2>
        <p className="countdown">
          {expiresAt ? clock(expiresAt - now) : "—"}{" "}
          <span className="muted">left · refreshes with a minute to go</span>
        </p>
        <p className="muted">Last auth event: {event ?? "—"}</p>
        {claims && <pre>{JSON.stringify(claims, null, 2)}</pre>}
      </section>

      <section className="card">
        <h2>Call a protected API</h2>
        <p className="muted">
          <code>GET /orbit/v1/platforms/…/players/me</code> with{" "}
          <code>Authorization: Bearer &lt;PAT&gt;</code>
        </p>
        <div className="row">
          <button type="button" onClick={callApi} disabled={busy}>
            Call it
          </button>
        </div>
        {api?.error && <p className="error">{api.error}</p>}
        {api?.user && <pre>{JSON.stringify(api.user, null, 2)}</pre>}
      </section>

      <section className="card row">
        <button
          type="button"
          className="secondary"
          onClick={() => signOut(false)}
        >
          Sign out
        </button>
        <button type="button" className="danger" onClick={() => signOut(true)}>
          Sign out everywhere
        </button>
        {signOutError && <p className="error">{signOutError}</p>}
      </section>
    </>
  );
}
