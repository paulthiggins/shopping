import { afterEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { type AddressInfo } from "node:net";
import { Store, newToken } from "./store";
import { makeServer } from "./index";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function setup() {
  const store = new Store(":memory:"),
    server = makeServer(store, { origin: "http://localhost" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  });
  return {
    store,
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
}
it("enforces bearer scope, rejects cross-origin writes and marks APIs no-store", async () => {
  const { store, base } = await setup(),
    token = newToken();
  store.create(token, randomUUID());
  const invalid = await fetch(base + "/api/state");
  expect(invalid.status).toBe(404);
  const state = await fetch(base + "/api/state", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(state.status).toBe(200);
  expect(state.headers.get("cache-control")).toBe("no-store");
  expect(state.headers.get("access-control-allow-origin")).toBeNull();
  const denied = await fetch(base + "/api/commands", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: "https://unrelated.test",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  expect(denied.status).toBe(403);
});
it("streams committed revisions without credentials in the stream URL", async () => {
  const { store, base } = await setup(),
    token = newToken(),
    state = store.create(token, randomUUID()),
    abort = new AbortController();
  const response = await fetch(base + "/api/events", {
    headers: { Authorization: `Bearer ${token}` },
    signal: abort.signal,
  });
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  const reader = response.body!.getReader();
  await reader.read();
  const post = await fetch(base + "/api/commands", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: randomUUID(),
      epoch: state.epoch,
      action: { type: "shop.add", id: "new", name: "Market" },
    }),
  });
  expect(post.status).toBe(200);
  const part = await reader.read();
  expect(new TextDecoder().decode(part.value)).toContain("data: 1");
  abort.abort();
  await reader.cancel().catch(() => {});
});

it("keeps legacy links working and handles allocation collisions without exposing a list", async () => {
  const { store, base } = await setup();
  const legacy = "AbC_" + "x".repeat(39);
  const original = store.create(legacy, randomUUID());
  expect(
    (
      await fetch(base + "/api/state", {
        headers: { Authorization: `Bearer ${legacy}` },
      })
    ).status,
  ).toBe(200);
  const token = newToken();
  store.create(token, randomUUID());
  const requestId = randomUUID();
  const post = (code: string) =>
    fetch(base + "/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: code, requestId }),
    });
  const collision = await post(token);
  expect(collision.status).toBe(409);
  expect(await collision.json()).toEqual({
    code: "token_taken",
    error: expect.any(String),
  });
  const retry = await post(newToken());
  expect(retry.status).toBe(201);
  expect(store.find(legacy)?.state).toEqual(original);
});
it("limits failed code guesses across endpoints and ignores spoofed forwarding headers", async () => {
  const { base, store } = await setup();
  const token = newToken();
  store.create(token, randomUUID());
  for (let i = 0; i < 30; i++) {
    expect(
      (
        await fetch(base + (i % 2 ? "/api/state" : "/api/events"), {
          headers: {
            Authorization: "Bearer aaa-aaa-aaa",
            "X-Forwarded-For": `192.0.2.${i}`,
          },
        })
      ).status,
    ).toBe(404);
  }
  const blocked = await fetch(base + "/api/state", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(blocked.status).toBe(429);
  expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
});
