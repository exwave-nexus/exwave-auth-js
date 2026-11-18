import type { NextRequest } from "next/server";
import { exwave } from "@/lib/exwave";

// Refreshes sessions whose PAT has under a minute left, before pages render.
export function proxy(request: NextRequest) {
  return exwave.proxy(request);
}

export const config = {
  // The auth route handler refreshes on its own.
  matcher: ["/((?!api/exwave|_next/static|_next/image|favicon.ico).*)"],
};
