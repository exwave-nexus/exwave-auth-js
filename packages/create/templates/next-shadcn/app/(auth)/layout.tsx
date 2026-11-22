import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Around every auth screen: your logo, linking home, above the card. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center gap-7 bg-muted/50 px-4 pt-18 pb-12 dark:bg-background">
      <Link href="/" aria-label="Home">
        <Image src="/exwave.svg" alt="" width={48} height={48} priority />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
