import { isExwaveAuthError } from "@exwave/auth/server";
import { exwave } from "@/lib/exwave";

// A protected API: accepts a PAT from any client (browser, game, server) and
// verifies it against Exwave's JWKS.
export async function GET(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer "))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { userId, claims } = await exwave.server.verifyPlayerAccessToken(
      header.slice("Bearer ".length),
    );
    return Response.json({ ok: true, userId, claims });
  } catch (error) {
    const code = isExwaveAuthError(error) ? error.code : "unavailable";
    return Response.json(
      { error: code },
      { status: code === "invalid_token" ? 401 : 503 },
    );
  }
}
