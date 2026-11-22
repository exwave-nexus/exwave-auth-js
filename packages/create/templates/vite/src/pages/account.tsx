import { useExwave } from "@exwave-nexus/auth/react";
import { useEffect } from "react";
import { AuthLink } from "@/components/exwave/auth-link";
import { ArrowLeftIcon } from "@/components/exwave/icons";
import { UserProfile } from "@/components/exwave/user-profile";

export function AccountPage() {
  const { isLoaded, user, navigate } = useExwave();

  useEffect(() => {
    if (isLoaded && !user)
      navigate("/sign-in?redirect=/account", { replace: true });
  }, [isLoaded, user, navigate]);
  if (!user) return null;

  return (
    <div className="account-page">
      <main className="account">
        <AuthLink href="/" className="back-link">
          <ArrowLeftIcon size={16} />
          Home
        </AuthLink>
        <h1>Your account</h1>
        <UserProfile user={user} />
        <p className="edit-hint">
          Edit this page in <code className="chip">src/pages/account.tsx</code>
        </p>
      </main>
    </div>
  );
}
