import Link from "next/link";
import { VerifyEmail } from "../forms";

// The verification email links here: ?exwave_verify=<code>&uid=<user id>.
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ exwave_verify?: string; uid?: string }>;
}) {
  const { exwave_verify: code, uid } = await searchParams;
  if (!code || !uid)
    return (
      <section className="card">
        <h1>This link doesn't work</h1>
        <Link href="/sign-in">Sign in</Link>
      </section>
    );
  return <VerifyEmail userId={uid} code={code} />;
}
