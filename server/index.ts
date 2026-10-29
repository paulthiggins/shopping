import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Store, digest, TokenTaken } from "./store.ts";
import { Conflict, type Command } from "../shared/model.ts";
const MAX_BODY = 5 * 1024 * 1024;
async function body(req: IncomingMessage): Promise<unknown> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new Conflict("Expected JSON.");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Conflict("Request is larger than 5 MiB.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Conflict("Invalid JSON.");
  }
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
const headers = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
export function makeServer(
  store: Store,
  options: { origin?: string; staticRoot?: string } = {},
) {
  const streams = new Map<string, Set<ServerResponse>>();
  const limits = new Map<string, { count: number; until: number }>();
  // Use the socket peer, never client-supplied forwarding headers. Behind the
  // bundled proxy this is a shared failure budget; successful requests do not consume it.
  const failedAuth = new Map<string, { count: number; until: number }>();
  const server = createServer(async (req, res) => {
    try {
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      const path = new URL(req.url ?? "/", "http://local").pathname;
      if (path === "/healthz" || path === "/api/healthz") {
        store.db.prepare("SELECT 1").get();
        json(res, 200, { ok: true });
        return;
      }
      if (path.startsWith("/api/")) {
        if (
          req.headers.origin &&
          options.origin &&
          req.headers.origin !== options.origin
        ) {
          json(res, 403, { error: "Origin not allowed." });
          return;
        }
        if (req.headers["sec-fetch-site"] === "cross-site") {
          json(res, 403, { error: "Cross-site request not allowed." });
          return;
        }
        const ip = req.socket.remoteAddress ?? "local",
          now = Date.now(),
          key = `${ip}:${path === "/api/collections" ? "create" : "api"}`;
        let limit = limits.get(key);
        if (!limit || limit.until < now) {
          limit = { count: 0, until: now + 60_000 };
          limits.set(key, limit);
        }
        if (
          ++limit.count >
          (path === "/api/collections"
            ? Number(process.env.CREATE_LIMIT ?? 10)
            : 600)
        ) {
          res.setHeader("Retry-After", "60");
          json(res, 429, { error: "Too many requests. Please wait a minute." });
          return;
        }
        if (limits.size > 10000)
          for (const [k, v] of limits) if (v.until < now) limits.delete(k);
        if (path === "/api/collections" && req.method === "POST") {
          const data = (await body(req)) as {
            token: string;
            requestId: string;
            backup?: unknown;
          };
          if (!data || typeof data !== "object")
            throw new Conflict("Invalid list creation.");
          const state = store.create(data.token, data.requestId, data.backup);
          json(res, 201, { state });
          return;
        }
        const failure = failedAuth.get(ip);
        if (failure && failure.until > now && failure.count >= 30) {
          res.setHeader(
            "Retry-After",
            String(Math.ceil((failure.until - now) / 1000)),
          );
          json(res, 429, {
            error: "Too many invalid list codes. Please wait a minute.",
          });
          return;
        }
        const token =
          req.headers.authorization?.match(/^Bearer ([a-zA-Z0-9_-]+)$/)?.[1] ??
          "";
        const collection = store.find(token);
        if (!collection) {
          if (failure && failure.until > now) failure.count++;
          else failedAuth.set(ip, { count: 1, until: now + 60_000 });
          if (failedAuth.size > 10000)
            for (const [key, entry] of failedAuth)
              if (entry.until <= now) failedAuth.delete(key);
          json(res, 404, { error: "This list link is not valid." });
          return;
        }
        if (path === "/api/state" && req.method === "GET") {
          json(res, 200, { state: collection.state });
          return;
        }
        if (path === "/api/commands" && req.method === "POST") {
          const input = (await body(req)) as Command;
          if (!input || typeof input !== "object")
            throw new Conflict("Invalid change.");
          const outcome = store.execute(token, input);
          json(res, 200, outcome);
          if (outcome.changed)
            for (const stream of streams.get(digest(token)) ?? [])
              stream.write(`data: ${outcome.state.revision}\n\n`);
          return;
        }
        if (path === "/api/events" && req.method === "GET") {
          const hash = digest(token),
            clients = streams.get(hash) ?? new Set<ServerResponse>();
          if (clients.size >= 20) {
            json(res, 429, {
              error: "Too many open connections for this list.",
            });
            return;
          }
          if ([...streams.values()].reduce((n, x) => n + x.size, 0) >= 300) {
            json(res, 503, {
              error: "Live updates are busy. Polling will continue.",
            });
            return;
          }
          streams.set(hash, clients);
          clients.add(res);
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          res.write(`retry: 3000\ndata: ${collection.state.revision}\n\n`);
          const heartbeat = setInterval(
            () => res.write(": heartbeat\n\n"),
            15000,
          );
          req.on("close", () => {
            clearInterval(heartbeat);
            clients.delete(res);
            if (!clients.size) streams.delete(hash);
          });
          return;
        }
        json(res, 404, { error: "Endpoint not found." });
        return;
      }
      if (!options.staticRoot || !["GET", "HEAD"].includes(req.method ?? "")) {
        json(res, 404, { error: "Not found." });
        return;
      }
      const root = resolve(options.staticRoot),
        file = resolve(
          root,
          "." + decodeURIComponent(path === "/" ? "/index.html" : path),
        );
      if (
        !file.startsWith(root + sep) ||
        path.split("/").some((p) => p.startsWith("."))
      ) {
        json(res, 404, { error: "Not found." });
        return;
      }
      try {
        const bytes = await readFile(file);
        res.setHeader(
          "Content-Type",
          (
            {
              ".html": "text/html; charset=utf-8",
              ".js": "application/javascript",
              ".css": "text/css",
              ".svg": "image/svg+xml",
              ".png": "image/png",
              ".webmanifest": "application/manifest+json",
            } as Record<string, string>
          )[extname(file)] ?? "application/octet-stream",
        );
        res.setHeader(
          "Cache-Control",
          path.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
        res.writeHead(200);
        res.end(req.method === "HEAD" ? undefined : bytes);
      } catch {
        json(res, 404, { error: "File not found." });
      }
    } catch (e) {
      if (!res.headersSent)
        json(
          res,
          e instanceof TokenTaken ? 409 : e instanceof Conflict ? 400 : 500,
          {
            ...(e instanceof TokenTaken ? { code: "token_taken" } : {}),
            error:
              e instanceof Conflict
                ? e.message
                : "Unable to complete that request.",
          },
        );
      else res.end();
    }
  });
  server.on("close", () => {
    for (const clients of streams.values())
      for (const client of clients) client.end();
  });
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const store = new Store(process.env.DB_PATH ?? "data/shopping.sqlite");
  const server = makeServer(store, {
    origin: process.env.APP_ORIGIN,
    staticRoot: process.env.SERVE_DIST === "1" ? "dist" : undefined,
  });
  const port = Number(process.env.PORT ?? 4181);
  server.listen(port, process.env.HOST ?? "127.0.0.1", () =>
    console.log(`Shopping List listening on port ${port}`),
  );
  const stop = () => {
    server.closeAllConnections();
    server.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
