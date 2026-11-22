import { createExwaveNext } from "@exwave-nexus/auth-nextjs";

// Reads NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY and EXWAVE_COOKIE_SECRET.
export const exwave = createExwaveNext();
