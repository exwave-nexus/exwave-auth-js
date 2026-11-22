import { createExwaveNext } from "@exwave-nexus/auth/next";

// Reads NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY and EXWAVE_COOKIE_SECRET.
export const exwave = createExwaveNext();
