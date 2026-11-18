import Link from "next/link";
import { exwave } from "@/lib/exwave";
import { ResetPasswordForm } from "../forms";

// The reset email links here: ?exwave_reset=<code>&uid=<user id>.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ exwave_reset?: string; uid?: string }>;
}) {
  const { exwave_reset: code, uid } = await searchParams;
  if (!code || !uid)
    return (
      <section className="card">
        <h1>This link doesn't work</h1>
        <Link href="/forgot-password">Ask for a new one</Link>
      </section>
    );
  const config = await exwave.getConfig().catch(() => null);
  return (
    <ResetPasswordForm
      userId={uid}
      code={code}
      policy={config?.passwordPolicy ?? null}
    />
  );
}
