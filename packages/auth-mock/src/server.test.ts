import { afterAll, expect, test } from "bun:test";
import { MOCK_PLATFORM_ID } from "./mock";
import { type MockServer, startMockServer } from "./server";

let server: MockServer | undefined;
afterAll(() => server?.close());

test("serves the mock over HTTP, with request bodies", async () => {
  server = await startMockServer({
    port: 0,
    hostnames: ["127.0.0.1"],
    log: () => {},
  });
  expect(server.mock.origin).toBe(`http://localhost:${server.port}`);
  const base = `http://127.0.0.1:${server.port}/orbit/v1/platforms/${MOCK_PLATFORM_ID}`;

  const config = await fetch(`${base}/config`);
  expect(config.status).toBe(200);
  expect((await config.json()).platform_id).toBe(MOCK_PLATFORM_ID);

  const signIn = await fetch(`${base}/players/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "player1", password: "Password123!" }),
  });
  expect(signIn.status).toBe(200);
  expect((await signIn.json()).player.username).toBe("player1");
  expect(signIn.headers.get("access-control-allow-origin")).toBe("*");
});
