import type { User } from "@exwave-nexus/auth";
import { Avatar } from "@/components/exwave/avatar";
import { CheckIcon, LogOutIcon } from "@/components/exwave/icons";
import { SignOutButton } from "@/components/exwave/sign-out-button";

/** The signed-in user, with sign-out here or on every device. */
export function UserProfile({ user }: { user: User }) {
  return (
    <section className="card profile" aria-label="Profile">
      <div className="profile-head">
        <Avatar name={user.displayName} large />
        <div className="profile-name">
          <strong>{user.displayName}</strong>
          {user.username && (
            <span className="profile-username">@{user.username}</span>
          )}
        </div>
      </div>
      <dl>
        <div className="profile-row">
          <dt>Email</dt>
          <dd>
            {user.email}
            {user.emailVerified ? (
              <span className="badge">
                <CheckIcon size={14} />
                Verified
              </span>
            ) : (
              <span className="badge badge-muted">Not verified</span>
            )}
          </dd>
        </div>
        <div className="profile-row">
          <dt>Username</dt>
          <dd>{user.username ?? "—"}</dd>
        </div>
        <div className="profile-row">
          <dt>User ID</dt>
          <dd>
            <code>{user.id}</code>
          </dd>
        </div>
      </dl>
      <div className="profile-actions">
        <SignOutButton>
          <LogOutIcon />
          Sign out
        </SignOutButton>
        <SignOutButton everywhere className="button button-ghost" />
        <p>Everywhere also ends your sessions on your other devices.</p>
      </div>
    </section>
  );
}
