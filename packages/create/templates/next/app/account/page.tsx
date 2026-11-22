import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "@/components/exwave/icons";
import { UserProfile } from "@/components/exwave/user-profile";
import { exwave } from "@/lib/exwave";

export default async function AccountPage() {
  const user = await exwave.getUser();
  if (!user) redirect("/sign-in?redirect=/account");

  return (
    <div className="account-page">
      <main className="account">
        <Link href="/" className="back-link">
          <ArrowLeftIcon size={16} />
          Home
        </Link>
        <h1>Your account</h1>
        <UserProfile user={user} />
        <p className="edit-hint">
          Edit this page in <code className="chip">app/account/page.tsx</code>
        </p>
      </main>
    </div>
  );
}
