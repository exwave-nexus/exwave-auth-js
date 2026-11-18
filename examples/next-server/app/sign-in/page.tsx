import { describeSignOut } from "@/lib/errors";
import { exwave } from "@/lib/exwave";
import { SignInForm } from "../forms";

export default async function SignInPage() {
  // Set for 5 minutes when a session ends: locked, ended elsewhere, expired,
  // or signed out here (proxy.ts, the route handler and Server Functions).
  const reason = await exwave.getSignOutReason();
  return <SignInForm signedOut={reason ? describeSignOut(reason) : null} />;
}
