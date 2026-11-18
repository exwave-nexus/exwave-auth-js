import { createExwaveNext } from "@exwave/auth/next";

// Reads NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY and EXWAVE_COOKIE_SECRET.
export const exwave = createExwaveNext();
