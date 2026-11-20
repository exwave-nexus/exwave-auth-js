// Serves the mock over HTTP with node:http, so it runs under Node and Bun.
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import {
  createMockAuth,
  MOCK_PORT,
  type MockAuth,
  type MockAuthOptions,
} from "./mock";

export interface MockServerOptions extends Omit<MockAuthOptions, "origin"> {
  /** Default 4010; `0` picks a free port. */
  port?: number;
  /** Default both loopbacks: "localhost" resolves to either, depending on the client. */
  hostnames?: string[];
}

export interface MockServer {
  mock: MockAuth;
  port: number;
  close(): Promise<void>;
}

async function toRequest(
  incoming: IncomingMessage,
  origin: string,
): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value))
      for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(chunk as Buffer);
  const method = incoming.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD" && chunks.length > 0;
  return new Request(new URL(incoming.url ?? "/", origin), {
    method,
    headers,
    body: hasBody ? Buffer.concat(chunks) : undefined,
  });
}

async function send(outgoing: ServerResponse, response: Response) {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => {
    outgoing.setHeader(name, value);
  });
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

function listen(server: Server, port: number, hostname: string) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

/** Starts the mock on `http://localhost:<port>`. */
export async function startMockServer(
  options: MockServerOptions = {},
): Promise<MockServer> {
  const { port: requested = MOCK_PORT, hostnames, ...mockOptions } = options;
  let mock: MockAuth | undefined;
  let port = requested;

  const handle = async (
    incoming: IncomingMessage,
    outgoing: ServerResponse,
  ) => {
    if (!mock) {
      outgoing.statusCode = 503;
      outgoing.end();
      return;
    }
    const origin = `http://localhost:${port}`;
    await send(outgoing, await mock.fetch(await toRequest(incoming, origin)));
  };

  const servers: Server[] = [];
  for (const hostname of hostnames ?? ["127.0.0.1", "::1"]) {
    const server = createServer((incoming, outgoing) => {
      handle(incoming, outgoing).catch((error) => {
        console.error(error);
        outgoing.statusCode = 500;
        outgoing.end();
      });
    });
    try {
      await listen(server, port, hostname);
    } catch (error) {
      // A machine without IPv6 still serves on 127.0.0.1.
      if (servers.length > 0) continue;
      throw error;
    }
    port = (server.address() as AddressInfo).port;
    servers.push(server);
  }

  mock = await createMockAuth({
    ...mockOptions,
    origin: `http://localhost:${port}`,
  });

  return {
    mock,
    port,
    close: () =>
      Promise.all(
        servers.map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve())),
        ),
      ).then(() => undefined),
  };
}
