import { decodePublishableKey } from "@exwave-nexus/auth";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * The local mock's origin when the publishable key points at it (create-exwave
 * writes the mock's key until you have yours), else `null`. Only the
 * development notices use it.
 */
export const localMockOrigin: string | null = (() => {
  try {
    const { authOrigin } = decodePublishableKey(
      process.env.NEXT_PUBLIC_EXWAVE_PUBLISHABLE_KEY ?? "",
    );
    return LOCAL_HOSTS.includes(new URL(authOrigin).hostname)
      ? authOrigin
      : null;
  } catch {
    return null;
  }
})();
