"use client";

// Development help: which Exwave Auth this app talks to. Delete this file,
// and its use on the home page, once your app runs on your platform.
import { useExwave } from "@exwave-nexus/auth-react";
import { CircleCheck, Plug, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
      <Alert role="status" className="border-0 bg-accent px-4 py-3.5">
        <Plug className="text-accent-foreground" />
        <AlertTitle className="font-bold">
          Connected to your Exwave platform
        </AlertTitle>
        <AlertDescription>
          The publishable key in <code>.env.local</code> points at your
          platform, so the local mock isn’t used. Accounts made here are real
          users, and their emails really go out.
        </AlertDescription>
      </Alert>
    );

  if (running === null) return null;

  if (!running)
    return (
      <Alert
        role="status"
        className="border-0 bg-warning-muted px-4 py-3.5 text-warning"
      >
        <TriangleAlert />
        <AlertTitle className="font-bold">
          The local mock isn’t running
        </AlertTitle>
        <AlertDescription className="text-warning">
          <p>
            <code>.env.local</code> points at the local mock, but nothing
            answers on <code>{new URL(localMockOrigin).host}</code>, so the app
            can’t sign anyone in. Start the mock with <code>npm run mock</code>,
            or put your publishable key from Nexus → Auth in{" "}
            <code>.env.local</code>.
          </p>
        </AlertDescription>
      </Alert>
    );

  return (
    <Alert
      role="status"
      className="border-0 bg-success-muted px-4 py-3.5 text-success"
    >
      <CircleCheck />
      <AlertTitle className="font-bold">Using the local mock</AlertTitle>
      <AlertDescription className="text-success">
        <p>
          Sign in as <code>player1</code> with <code>Password123!</code>, or
          create an account: the mock prints the verification link in its
          terminal. Its accounts live in memory and are gone when it stops.
        </p>
        <p>
          To go live, put your publishable key from Nexus → Auth in{" "}
          <code>.env.local</code>.
        </p>
      </AlertDescription>
    </Alert>
  );
}
