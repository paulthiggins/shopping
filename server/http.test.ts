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
