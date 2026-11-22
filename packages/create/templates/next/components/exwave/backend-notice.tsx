"use client";

// Development help: which Exwave Auth this app talks to. Delete this file,
// and its two uses, once your app runs on your platform.
import { useExwave } from "@exwave-nexus/auth/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  CheckCircleIcon,
  PlugIcon,
  TerminalIcon,
  WarningIcon,
} from "@/components/exwave/icons";
import { localMockOrigin } from "@/lib/local-mock";

/** The local mock (running or not), or your platform: what the publishable key points at. */
export function BackendNotice() {
  const { auth } = useExwave();
  const [running, setRunning] = useState<boolean | null>(null);

  useEffect(() => {
    if (!localMockOrigin) return;
    let active = true;
    auth.getConfig().then(
      () => active && setRunning(true),
      () => active && setRunning(false),
    );
    return () => {
      active = false;
    };
  }, [auth]);

  if (!localMockOrigin)
    return (
      <Notice tone="info" icon={<PlugIcon size={20} />}>
        <strong className="notice-title">
          Connected to your Exwave platform
        </strong>
        <span>
          The publishable key in <code>.env.local</code> points at your
          platform, so the local mock isn’t used. Accounts made here are real
          users, and their emails really go out.
        </span>
      </Notice>
    );

  if (running === null) return null;

  if (!running)
    return (
      <Notice tone="warn" icon={<WarningIcon size={20} />}>
        <strong className="notice-title">The local mock isn’t running</strong>
        <span>
          <code>.env.local</code> points at the local mock, but nothing answers
          on <code>{new URL(localMockOrigin).host}</code>, so the app can’t sign
          anyone in. Start the mock with <code>npm run mock</code>, or put your
          publishable key from Nexus → Auth in <code>.env.local</code>.
        </span>
      </Notice>
    );

  return (
    <Notice tone="ok" icon={<CheckCircleIcon size={20} />}>
      <strong className="notice-title">Using the local mock</strong>
      <span>
        Sign in as <code>player1</code> with <code>Password123!</code>, or
        create an account: the mock prints the verification link in its
        terminal. Its accounts live in memory and are gone when it stops.
      </span>
      <span>
        To go live, put your publishable key from Nexus → Auth in{" "}
        <code>.env.local</code>.
      </span>
    </Notice>
  );
}

/** On the check-your-email screens, when the mock sends the emails. */
export function MockEmailNote() {
  if (!localMockOrigin) return null;
  return (
    <p className="notice notice-ok">
      <TerminalIcon />
      <span>
        <strong>Local mock:</strong> the link is printed in its terminal.
      </span>
    </p>
  );
}

function Notice({
  tone,
  icon,
  children,
}: {
  tone: "info" | "ok" | "warn";
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div role="status" className={`notice notice-${tone}`}>
      {icon}
      <div className="notice-body">{children}</div>
    </div>
  );
}
