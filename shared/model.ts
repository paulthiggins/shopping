export type Shop = { id: string; name: string; nameRevision: number };
export type Item = {
  id: string;
  shopId: string;
  name: string;
  quantity: number;
  nameRevision: number;
};
export type Remembered = {
  name: string;
  lastUsed: number;
  forgotten: boolean;
  revision: number;
};
export type State = {
  schemaVersion: 1;
  epoch: string;
  revision: number;
  title: string;
  shops: Shop[];
  items: Item[];
  history: Record<string, Remembered>;
};
export type Action =
  | { type: "shop.add"; id: string; name: string }
  | { type: "shop.rename"; id: string; name: string; expected: number }
  | { type: "shop.delete"; id: string }
  | { type: "shop.move"; id: string; beforeId: string | null }
  | {
      type: "item.add";
      id: string;
      shopId: string;
      name: string;
      quantity: number;
      historyRevision: number;
    }
  | {
      type: "item.rename";
      id: string;
      name: string;
      expected: number;
      merge: boolean;
      historyRevision: number;
    }
  | { type: "item.delta"; id: string; delta: number }
  | { type: "item.delete"; id: string }
  | { type: "item.move"; id: string; beforeId: string | null }
  | { type: "history.forget"; name: string; itemId?: string }
  | { type: "history.remember"; name: string };
export type Command = { id: string; epoch: string; action: Action };
export type Result = {
  ok: boolean;
  message?: string;
  canonicalId?: string;
  revision: number;
};
export class Conflict extends Error {}
export const normalise = (name: string) =>
  name.trim().replace(/\s+/gu, " ").toLowerCase();
export function text(value: unknown, max = 200): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    Array.from(value).some(
      (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    )
  )
    throw new Conflict(`Enter a name between 1 and ${max} characters.`);
  return value.trim().replace(/\s+/gu, " ");
}
export function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new Conflict("Invalid identifier.");
  return value;
}
export function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new Conflict(`Quantity must be between ${min} and ${max}.`);
  return value;
}
export function blank(epoch: string, ids: string[]): State {
  return {
    schemaVersion: 1,
    epoch,
    revision: 0,
    title: "Our shopping list",
    shops: ["Aldi", "Lidl", "Tesco"].map((name, i) => ({
      id: ids[i],
      name,
      nameRevision: 0,
    })),
    items: [],
    history: {},
  };
}
export const rememberedEntry = (s: State, name: string) =>
  Object.hasOwn(s.history, normalise(name))
    ? s.history[normalise(name)]
    : undefined;
export const rememberedRevision = (s: State, name: string) =>
  rememberedEntry(s, name)?.revision ?? 0;
export function suggestions(s: State, input: string): Remembered[] {
  const key = normalise(input);
  return key
    ? Object.entries(s.history)
        .filter(([k, v]) => k.includes(key) && !v.forgotten)
        .map(([, v]) => v)
        .sort((a, b) => b.lastUsed - a.lastUsed || a.name.localeCompare(b.name))
        .slice(0, 10)
    : [];
}
function history(
  s: State,
  name: string,
  revision: number,
  now: number,
  expected?: number,
) {
  const key = normalise(name),
    current = rememberedEntry(s, name);
  if (
    current?.forgotten &&
    expected !== undefined &&
    expected !== current.revision
  )
    throw new Conflict(
      `“${name}” was forgotten on another device. Review before remembering it again.`,
    );
  if (!current && Object.keys(s.history).length >= 50_000)
    throw new Conflict("Remembered item limit reached.");
  Object.defineProperty(s.history, key, {
    value: { name, lastUsed: now, forgotten: false, revision },
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
function move<T extends { id: string }>(
  list: T[],
  id: string,
  beforeId: string | null,
): T[] {
  const entry = list.find((i) => i.id === id);
  if (!entry) throw new Conflict("This entry was removed on another device.");
  if (id === beforeId) return list;
  const result = list.filter((i) => i.id !== id),
    index = result.findIndex((i) => i.id === beforeId);
  result.splice(index < 0 ? result.length : index, 0, entry);
  return result;
}
export function apply(
  state: State,
  action: Action,
  now = Date.now(),
): { state: State; canonicalId?: string } {
  const s: State = structuredClone(state),
    revision = s.revision + 1;
  const shop = (id: string) => {
    identifier(id);
    const x = s.shops.find((i) => i.id === id);
    if (!x)
      throw new Conflict(
        "This shop was removed. Your change has been kept for review.",
      );
    return x;
  };
  const row = (id: string) => {
    identifier(id);
    const x = s.items.find((i) => i.id === id);
    if (!x)
      throw new Conflict(
        "This item was removed. Your change has been kept for review.",
      );
    return x;
  };
  const nameFree = (name: string, id: string) => {
    if (
      s.shops.some((x) => x.id !== id && normalise(x.name) === normalise(name))
    )
      throw new Conflict("A shop with this name already exists.");
  };
  let canonicalId: string | undefined;
  switch (action.type) {
    case "shop.add": {
      identifier(action.id);
      const name = text(action.name, 80);
      nameFree(name, action.id);
      if (s.shops.some((x) => x.id === action.id))
        throw new Conflict("Shop identifier already exists.");
      if (s.shops.length >= 100) throw new Conflict("Shop limit reached.");
      s.shops.push({ id: action.id, name, nameRevision: revision });
      break;
    }
    case "shop.rename": {
      const x = shop(action.id),
        name = text(action.name, 80);
      integer(action.expected, 0, Number.MAX_SAFE_INTEGER);
      nameFree(name, x.id);
      if (x.nameRevision !== action.expected && x.name !== name)
        throw new Conflict(
          `The shop is now called “${x.name}”. Review your rename.`,
        );
      x.name = name;
      x.nameRevision = revision;
      break;
    }
    case "shop.delete":
      shop(action.id);
      s.shops = s.shops.filter((x) => x.id !== action.id);
      s.items = s.items.filter((x) => x.shopId !== action.id);
      break;
    case "shop.move":
      shop(action.id);
      if (action.beforeId !== null) identifier(action.beforeId);
      s.shops = move(s.shops, action.id, action.beforeId);
      break;
    case "item.add": {
      shop(action.shopId);
      identifier(action.id);
      integer(action.historyRevision, 0, Number.MAX_SAFE_INTEGER);
      const name = text(action.name),
        quantity = integer(action.quantity, 1, 999);
      history(s, name, revision, now, action.historyRevision);
      const existing = s.items.find(
        (x) =>
          x.shopId === action.shopId && normalise(x.name) === normalise(name),
      );
      if (existing) {
        existing.quantity = integer(existing.quantity + quantity, 1, 999);
        canonicalId = existing.id;
      } else {
        if (s.items.length >= 10_000) throw new Conflict("Item limit reached.");
        if (s.items.some((x) => x.id === action.id))
          throw new Conflict("Item identifier already exists.");
        s.items.push({
          id: action.id,
          shopId: action.shopId,
          name,
          quantity,
          nameRevision: revision,
        });
        canonicalId = action.id;
      }
      break;
    }
    case "item.rename": {
      const x = row(action.id),
        name = text(action.name);
      integer(action.expected, 0, Number.MAX_SAFE_INTEGER);
      integer(action.historyRevision, 0, Number.MAX_SAFE_INTEGER);
      if (typeof action.merge !== "boolean")
        throw new Conflict("Invalid merge choice.");
      if (x.nameRevision !== action.expected && x.name !== name)
        throw new Conflict(
          `This item is now “${x.name}”. Your draft is still here.`,
        );
      const target = s.items.find(
        (i) =>
          i.id !== x.id &&
          i.shopId === x.shopId &&
          normalise(i.name) === normalise(name),
      );
      if (target && !action.merge)
        throw new Conflict(
          "An item with this name exists. Confirm the merge to combine quantities.",
        );
      history(s, name, revision, now, action.historyRevision);
      if (target) {
        target.quantity = integer(target.quantity + x.quantity, 1, 999);
        s.items = s.items.filter((i) => i.id !== x.id);
        canonicalId = target.id;
      } else {
        x.name = name;
        x.nameRevision = revision;
      }
      break;
    }
    case "item.delta": {
      const x = row(action.id);
      integer(action.delta, -998, 998);
      if (action.delta === 0) throw new Conflict("No quantity change.");
      x.quantity = integer(x.quantity + action.delta, 1, 999);
      break;
    }
    case "item.delete":
      row(action.id);
      s.items = s.items.filter((x) => x.id !== action.id);
      break;
    case "item.move": {
      const x = row(action.id);
      if (action.beforeId !== null) identifier(action.beforeId);
      const ordered = move(
        s.items.filter((i) => i.shopId === x.shopId),
        x.id,
        action.beforeId,
      );
      s.items = [...s.items.filter((i) => i.shopId !== x.shopId), ...ordered];
      break;
    }
    case "history.forget": {
      const name = text(action.name),
        key = normalise(name);
      if (action.itemId) {
        const x = row(action.itemId);
        if (normalise(x.name) !== key)
          throw new Conflict(
            "This item was renamed. Review before forgetting.",
          );
        s.items = s.items.filter((i) => i.id !== x.id);
      }
      history(s, name, revision, now);
      s.history[key].forgotten = true;
      break;
    }
    case "history.remember":
      history(s, text(action.name), revision, now);
      break;
    default:
      throw new Conflict("Unknown change type. Update the app and try again.");
  }
  s.revision = revision;
  return { state: s, canonicalId };
}
export function remap(action: Action, from: string, to: string): Action {
  const a = structuredClone(action);
  if ("id" in a && a.id === from) a.id = to;
  if ("beforeId" in a && a.beforeId === from) a.beforeId = to;
  if ("itemId" in a && a.itemId === from) a.itemId = to;
  return a;
}
export type Backup = {
  format: "shopping-list";
  version: 1;
  exportedAt: string;
  syncStatus: string;
  title: string;
  lists: Record<
    string,
    { items: Array<{ id: string; name: string; quantity: number }> }
  >;
  itemHistory: Record<string, Remembered>;
};
export function exportData(s: State, pending = 0): Backup {
  return {
    format: "shopping-list",
    version: 1,
    exportedAt: new Date().toISOString(),
    syncStatus: pending
      ? `Local visible state; ${pending} changes not confirmed`
      : "Confirmed server state",
    title: s.title,
    lists: Object.fromEntries(
      s.shops.map((shop) => [
        shop.name,
        {
          items: s.items
            .filter((i) => i.shopId === shop.id)
            .map(({ id, name, quantity }) => ({ id, name, quantity })),
        },
      ]),
    ),
    itemHistory: structuredClone(s.history),
  };
}
export function importData(
  raw: unknown,
  epoch: string,
  uuid: () => string,
): State {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Conflict("Choose a shopping list JSON backup.");
  const data = raw as Record<string, unknown>;
  if (
    data.version !== 1 ||
    (data.format !== undefined && data.format !== "shopping-list")
  )
    throw new Conflict("Unsupported backup format or version.");
  if (
    typeof data.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(data.exportedAt))
  )
    throw new Conflict("Invalid backup date.");
  if (
    !data.lists ||
    typeof data.lists !== "object" ||
    Array.isArray(data.lists) ||
    !data.itemHistory ||
    typeof data.itemHistory !== "object" ||
    Array.isArray(data.itemHistory)
  )
    throw new Conflict("Backup must contain shops and remembered items.");
  const s = blank(epoch, []);
  s.shops = [];
  if (data.title !== undefined) s.title = text(data.title, 100);
  const names = new Set<string>();
  let total = 0;
  for (const [shopName, value] of Object.entries(data.lists)) {
    const name = text(shopName, 80),
      key = normalise(name);
    if (names.has(key)) throw new Conflict("Duplicate shop names in backup.");
    names.add(key);
    if (
      !value ||
      typeof value !== "object" ||
      !Array.isArray((value as { items: unknown }).items)
    )
      throw new Conflict("Invalid shop in backup.");
    const shopId = uuid();
    s.shops.push({ id: shopId, name, nameRevision: 0 });
    const rows = new Set<string>();
    for (const v of (value as { items: unknown[] }).items) {
      if (!v || typeof v !== "object")
        throw new Conflict("Invalid backup item.");
      const i = v as Record<string, unknown>;
      if (
        typeof i.id !== "string" ||
        !i.id ||
        (i.purchased !== undefined && typeof i.purchased !== "boolean")
      )
        throw new Conflict("Invalid legacy item fields.");
      const label = text(i.name),
        quantity = integer(i.quantity, 1, 999),
        k = normalise(label);
      if (rows.has(k))
        throw new Conflict(
          `Duplicate items in “${name}”. Resolve them before importing.`,
        );
      rows.add(k);
      s.items.push({
        id: uuid(),
        shopId,
        name: label,
        quantity,
        nameRevision: 0,
      });
      if (++total > 10_000) throw new Conflict("Too many items.");
    }
  }
  if (s.shops.length > 100) throw new Conflict("Too many shops.");
  for (const [key, val] of Object.entries(data.itemHistory)) {
    const k = normalise(text(key));
    if (!val || typeof val !== "object")
      throw new Conflict("Invalid remembered item.");
    const h = val as Record<string, unknown>,
      name = text(h.originalName ?? h.name ?? key);
    if (
      normalise(name) !== k ||
      typeof h.forgotten !== "boolean" ||
      typeof h.lastUsed !== "number" ||
      !Number.isSafeInteger(h.lastUsed) ||
      h.lastUsed < 0
    )
      throw new Conflict("Invalid remembered item fields.");
    const old = rememberedEntry(s, k);
    Object.defineProperty(s.history, k, {
      value: {
        name: old && old.lastUsed > h.lastUsed ? old.name : name,
        lastUsed: Math.max(old?.lastUsed ?? 0, h.lastUsed),
        forgotten: !!old?.forgotten || h.forgotten,
        revision: 0,
      },
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  if (Object.keys(s.history).length > 50_000)
    throw new Conflict("Too many remembered items.");
  return s;
}
