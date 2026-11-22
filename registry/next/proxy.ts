import type { NextRequest } from "next/server";
import { exwave } from "@/lib/exwave";

// Keeps sessions fresh before pages render, and clears ended ones.
export function proxy(request: NextRequest) {
  return exwave.proxy(request);
}

export const config = {
  // The auth routes refresh on their own; static files need no session.
  matcher: [
    "/((?!api/exwave|_next/static|_next/image|favicon.ico|icon.svg|exwave.svg).*)",
  ],
};
