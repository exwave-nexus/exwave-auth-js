import type { ReactNode } from "react";
import { AuthPage } from "@/components/exwave/auth-page";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthPage>{children}</AuthPage>;
}
