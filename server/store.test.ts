import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Store, newToken } from "./store";
import { type Command, type Action } from "../shared/model";
const stores: Store[] = [];
afterEach(() => {
  stores.forEach((s) => s.close());
  stores.length = 0;
});
function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const token = newToken(),
    state = store.create(token, randomUUID());
  const command = (action: Action): Command => ({
    id: randomUUID(),
    epoch: state.epoch,
    action,
  });
  return { store, token, state, command };
}
describe("transactional shared storage", () => {
  it("creates idempotently and stores only a token digest", () => {
    const { store, token } = setup();
    expect(
      store.db.prepare("SELECT token_hash FROM collections").get()?.token_hash,
    ).not.toBe(token);
    const t = newToken(),
      id = randomUUID();
    const a = store.create(t, id);
    expect(store.create(t, id)).toEqual(a);
    expect(() => store.create(newToken(), id)).toThrow();
  });
  it("deduplicates retries even after later operations", () => {
    const { store, token, state, command } = setup();
    const add = command({
      type: "item.add",
      id: "one",
      shopId: state.shops[0].id,
      name: "Milk",
      quantity: 1,
      historyRevision: 0,
    });
    store.execute(token, add);
    const delta = command({ type: "item.delta", id: "one", delta: 1 });
    store.execute(token, delta);
    store.execute(token, delta);
    expect(store.find(token)?.state.items[0].quantity).toBe(2);
    expect(() =>
      store.execute(token, {
        ...delta,
        action: { ...delta.action, delta: 2 } as Action,
      }),
    ).toThrow();
  });
  it("returns canonical IDs for concurrent duplicate additions", () => {
    const { store, token, state, command } = setup();
    for (const id of ["a", "b"]) {
      const result = store.execute(
        token,
        command({
          type: "item.add",
          id,
          shopId: state.shops[0].id,
          name: "Milk",
          quantity: 1,
          historyRevision: 0,
        }),
      );
      expect(result.result.canonicalId).toBe("a");
    }
    expect(store.find(token)?.state.items[0].quantity).toBe(2);
  });
  it("returns recoverable conflicts without modifying the document", () => {
    const { store, token, command } = setup();
    const before = store.find(token)?.state;
    const outcome = store.execute(
      token,
      command({ type: "item.delta", id: "missing", delta: 1 }),
    );
    expect(outcome.result.ok).toBe(false);
    expect(outcome.state).toEqual(before);
  });
  it("scopes rows and receipts to the authenticated collection", () => {
    const { store, token, state, command } = setup(),
      other = newToken();
    store.create(other, randomUUID());
    const add = command({
      type: "item.add",
      id: "private",
      shopId: state.shops[0].id,
      name: "Milk",
      quantity: 1,
      historyRevision: 0,
    });
    store.execute(token, add);
    expect(store.find(other)?.state.items).toEqual([]);
    const b = store.find(other)!.state;
    expect(
      store.execute(other, {
        id: randomUUID(),
        epoch: b.epoch,
        action: { type: "item.delta", id: "private", delta: 1 },
      }).result.ok,
    ).toBe(false);
    expect(store.find("invalid")).toBeNull();
  });
  it("rejects an old recovery epoch without replaying an edit", () => {
    const { store, token, command } = setup();
    const c = command({ type: "shop.add", id: "new", name: "Market" });
    expect(store.execute(token, { ...c, epoch: "old" }).result.ok).toBe(false);
    expect(store.find(token)?.state.shops).toHaveLength(3);
  });
});
