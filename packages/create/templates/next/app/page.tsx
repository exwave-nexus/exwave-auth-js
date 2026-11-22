import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/exwave/avatar";
import { BackendNotice } from "@/components/exwave/backend-notice";
import {
  ArrowRightIcon,
  BlocksIcon,
  BookIcon,
  DashboardIcon,
  RingsIcon,
  UserIcon,
} from "@/components/exwave/icons";
import { SignOutButton } from "@/components/exwave/sign-out-button";
import { exwave } from "@/lib/exwave";

export default async function HomePage() {
  const user = await exwave.getUser();
  return (
    <main className="home">
      <div className="hero">
        <div className="hero-logo">
          <RingsIcon className="hero-rings" />
          <Image src="/exwave.svg" alt="Exwave" width={112} height={112} />
        </div>
        <h1>
          Exwave Auth <span className="hero-plus">+</span> Next.js
        </h1>
        <p>
          Sign-up, sign-in, email verification and password reset, already wired
          up. Every screen is a file in your app, yours to change.
        </p>
      </div>

      <div className="status">
        <section className="card session" aria-label="Your session">
          {user ? (
            <>
              <div className="session-user">
                <Avatar name={user.displayName} />
                <div className="session-text">
                  <strong>Signed in as {user.displayName}</strong>
                  <span className="session-detail">{user.email}</span>
                </div>
              </div>
              <p className="session-note">
                This page read your session on the server, with{" "}
                <code>exwave.getUser()</code>.
              </p>
              <div className="session-actions">
                <Link href="/account" className="button button-primary">
                  Your account
                </Link>
                <SignOutButton />
              </div>
            </>
          ) : (
            <>
              <div className="session-user">
                <span className="avatar avatar-empty" aria-hidden="true">
                  <UserIcon size={22} />
                </span>
                <div className="session-text">
                  <strong>You’re signed out</strong>
                  <span className="session-detail">
                    Create an account or sign in, and your session shows up
                    here.
                  </span>
                </div>
              </div>
              <div className="session-actions">
                <Link href="/sign-up" className="button button-primary">
                  Create an account
                </Link>
                <Link href="/sign-in" className="button button-outline">
                  Sign in
                </Link>
              </div>
            </>
          )}
        </section>
        <BackendNotice />
      </div>

      <p className="edit-hint">
        Get started by editing <code className="chip">app/page.tsx</code>
      </p>

      <nav className="tiles" aria-label="Learn more">
        <a
          className="tile"
          href="https://www.exwave.net/docs/auth/get-started/"
        >
          <strong className="tile-title">
            <BookIcon />
            Auth guide
            <ArrowRightIcon size={16} />
          </strong>
          <span className="tile-text">
            Sessions, server checks and every hook, step by step.
          </span>
        </a>
        <a className="tile" href="https://www.exwave.net/docs/auth/components/">
          <strong className="tile-title">
            <BlocksIcon />
            Components
            <ArrowRightIcon size={16} />
          </strong>
          <span className="tile-text">
            The hooks behind these screens, and shadcn/ui versions of them.
          </span>
        </a>
        <a className="tile" href="https://nexus.exwave.net/">
          <strong className="tile-title">
            <DashboardIcon />
            Nexus
            <ArrowRightIcon size={16} />
          </strong>
          <span className="tile-text">
            Your users, sign-up settings, emails and Redirect URLs.
          </span>
        </a>
      </nav>
    </main>
  );
}
