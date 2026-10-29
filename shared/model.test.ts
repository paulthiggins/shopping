import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  apply,
  blank,
  exportData,
  importData,
  suggestions,
  rememberedRevision,
  remap,
  type State,
  type Action,
} from "./model";
const seed = () => blank("epoch", ["a", "b", "c"]);
const add = (
  s: State,
  id = "one",
  name = "Bananas",
  shopId = "a",
  quantity = 1,
) =>
  apply(
    s,
    {
      type: "item.add",
      id,
      name,
      shopId,
      quantity,
      historyRevision: rememberedRevision(s, name),
    },
    10,
  ).state;
const go = (s: State, a: Action) => apply(s, a, 20).state;
describe("shopping behaviour", () => {
  it("starts with only the three confirmed shops", () =>
    expect(seed().shops.map((s) => s.name)).toEqual(["Aldi", "Lidl", "Tesco"]));
  it("preserves display case and increments case-insensitive duplicates", () => {
    const s = add(add(seed()), "two", "bananas");
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ name: "Bananas", quantity: 2 });
  });
  it("keeps the same name independent across shops", () =>
    expect(add(add(seed()), "two", "Bananas", "b").items).toHaveLength(2));
  it("never decrements below one or increments past 999", () => {
    expect(() =>
      go(add(seed()), { type: "item.delta", id: "one", delta: -1 }),
    ).toThrow();
    expect(() =>
      go(add(seed(), "one", "Bananas", "a", 999), {
        type: "item.delta",
        id: "one",
        delta: 1,
      }),
    ).toThrow();
  });
  it("applies both quantity deltas", () => {
    let s = add(seed());
    s = go(s, { type: "item.delta", id: "one", delta: 1 });
    s = go(s, { type: "item.delta", id: "one", delta: 1 });
    expect(s.items[0].quantity).toBe(3);
  });
  it("deletes a row without forgetting its suggestion", () => {
    const s = go(add(seed()), { type: "item.delete", id: "one" });
    expect(s.items).toEqual([]);
    expect(suggestions(s, "nan")[0].name).toBe("Bananas");
  });
  it("forgets collection-wide but retains another shop’s row", () => {
    const s = go(add(add(seed()), "two", "Bananas", "b"), {
      type: "history.forget",
      name: "Bananas",
      itemId: "one",
    });
    expect(s.items.map((i) => i.id)).toEqual(["two"]);
    expect(suggestions(s, "ban")).toEqual([]);
  });
  it("explicit manual addition remembers a forgotten name again", () => {
    let s = go(add(seed()), {
      type: "history.forget",
      name: "Bananas",
      itemId: "one",
    });
    s = add(s, "two");
    expect(suggestions(s, "ban")).toHaveLength(1);
  });
  it("blocks an offline add from silently reversing a newer forget", () => {
    const s = go(add(seed()), { type: "history.forget", name: "Bananas" });
    expect(() =>
      go(s, {
        type: "item.add",
        id: "two",
        name: "Bananas",
        shopId: "a",
        quantity: 1,
        historyRevision: 1,
      }),
    ).toThrow(/forgotten/);
  });
  it("rejects stale renames but preserves unrelated quantity changes", () => {
    let s = add(seed());
    const expected = s.items[0].nameRevision;
    s = go(s, { type: "item.delta", id: "one", delta: 1 });
    s = go(s, {
      type: "item.rename",
      id: "one",
      name: "Pears",
      expected,
      merge: false,
      historyRevision: 0,
    });
    expect(s.items[0].quantity).toBe(2);
    expect(() =>
      go(s, {
        type: "item.rename",
        id: "one",
        name: "Apples",
        expected,
        merge: false,
        historyRevision: 0,
      }),
    ).toThrow(/draft/);
  });
  it("requires confirmation before merging renamed duplicates", () => {
    const s = add(add(seed()), "two", "Apples");
    const a: Action = {
      type: "item.rename",
      id: "one",
      name: "Apples",
      expected: s.items[0].nameRevision,
      merge: false,
      historyRevision: rememberedRevision(s, "Apples"),
    };
    expect(() => go(s, a)).toThrow(/merge/);
    const next = go(s, { ...a, merge: true });
    expect(next.items).toHaveLength(1);
    expect(next.items[0].quantity).toBe(2);
  });
  it("deleting a shop preserves history and allows zero shops", () => {
    let s = add(seed());
    for (const shop of [...s.shops])
      s = go(s, { type: "shop.delete", id: shop.id });
    expect(s.shops).toEqual([]);
    expect(s.items).toEqual([]);
    expect(Object.keys(s.history)).toHaveLength(1);
  });
  it("checks duplicate shop names and keeps stable IDs on rename", () => {
    expect(() =>
      go(seed(), { type: "shop.add", id: "d", name: " aldi " }),
    ).toThrow();
    const s = go(seed(), {
      type: "shop.rename",
      id: "a",
      name: "Market",
      expected: 0,
    });
    expect(s.shops[0].id).toBe("a");
  });
  it("moves rows with stable anchors and falls back to the end", () => {
    const s = add(add(seed()), "two", "Apples");
    expect(
      go(s, { type: "item.move", id: "two", beforeId: "one" }).items.map(
        (i) => i.id,
      ),
    ).toEqual(["two", "one"]);
    expect(
      go(s, { type: "item.move", id: "one", beforeId: "deleted" }).items.map(
        (i) => i.id,
      ),
    ).toEqual(["two", "one"]);
  });
  it("does not resurrect a deleted row via a stale command", () =>
    expect(() =>
      go(go(add(seed()), { type: "item.delete", id: "one" }), {
        type: "item.delta",
        id: "one",
        delta: 1,
      }),
    ).toThrow(/removed/));
  it("remaps dependent commands after duplicate resolution", () =>
    expect(
      remap({ type: "item.delta", id: "old", delta: 1 }, "old", "canonical"),
    ).toEqual({ type: "item.delta", id: "canonical", delta: 1 }));
  it("treats prototype-like product names as ordinary data", () => {
    let s = add(seed(), "one", "__proto__");
    s = add(s, "two", "constructor");
    expect(Object.keys(s.history)).toHaveLength(2);
    expect(suggestions(s, "proto")[0].name).toBe("__proto__");
  });
  it("rejects invalid field types, overlong names and control characters", () => {
    for (const name of ["", "a".repeat(201), "hello\nworld"])
      expect(() => add(seed(), "one", name)).toThrow();
    expect(() => add(seed(), "one", "Milk", "a", 1.5)).toThrow();
  });
});
const legacy = () => ({
  version: 1,
  exportedAt: "2026-10-28T00:00:00Z",
  lists: {
    Aldi: {
      items: [{ id: "old", name: "Milk", quantity: 2, purchased: true }],
    },
    "Custom Shop": {
      items: [{ id: "old", name: "Bread", quantity: 1, purchased: false }],
    },
  },
  itemHistory: {
    milk: { lastUsed: 100, forgotten: true, originalName: "Milk" },
  },
});
describe("backup migration", () => {
  it("imports custom shops, quantities and every purchased row without a completion field", () => {
    const s = importData(legacy(), "epoch", randomUUID);
    expect(s.shops.map((i) => i.name)).toEqual(["Aldi", "Custom Shop"]);
    expect(s.items).toHaveLength(2);
    expect(s.items[0].quantity).toBe(2);
    expect(s.items[0]).not.toHaveProperty("purchased");
    expect(s.items[0].id).not.toBe(s.items[1].id);
    expect(suggestions(s, "mil")).toEqual([]);
  });
  it("round-trips native exports without credentials", () => {
    const s = add(seed()),
      backup = exportData(s, 1),
      restored = importData(backup, "new", randomUUID);
    expect(restored.items[0].name).toBe("Bananas");
    expect(backup.syncStatus).toContain("not confirmed");
    expect(backup).not.toHaveProperty("token");
    expect(restored.shops.map((s) => s.name)).toEqual([
      "Aldi",
      "Lidl",
      "Tesco",
    ]);
  });
  it("rejects unknown versions and malformed values before any save", () => {
    expect(() =>
      importData({ ...legacy(), version: 2 }, "epoch", randomUUID),
    ).toThrow();
    const x = legacy();
    x.lists.Aldi.items[0].quantity = 0;
    expect(() => importData(x, "epoch", randomUUID)).toThrow();
  });
  it("accepts prototype-like shop/history keys safely", () => {
    const raw = JSON.parse(
      '{"version":1,"exportedAt":"2026-10-28","lists":{"__proto__":{"items":[]}},"itemHistory":{"__proto__":{"lastUsed":1,"forgotten":false}}}',
    );
    expect(importData(raw, "epoch", randomUUID).history["__proto__"].name).toBe(
      "__proto__",
    );
  });
});
