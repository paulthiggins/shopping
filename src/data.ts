import { connectLiveUpdates } from "./live-updates";
import { uuid, syncLock } from "./platform";
import Dexie, { liveQuery, type Table } from "dexie";
import { useEffect, useState } from "react";
import {
  apply,
  remap,
  rememberedRevision,
  type Action,
  type State,
  type Item,
  type Shop,
  type Command,
  type Result,
} from "../shared/model";
export type Job = {
  command: Command;
  status: "pending" | "conflict";
  message?: string;
  context?: { item?: Item; shop?: Shop };
};
export type Local = {
  token: string;
  confirmed: State;
  jobs: Job[];
  usedAt: number;
};
class ShoppingDB extends Dexie {
  lists!: Table<Local, string>;
  constructor() {
    super("shopping-list-v1");
    this.version(1).stores({ lists: "token,usedAt" });
  }
}
export const db = new ShoppingDB();
export function useLocal(token: string) {
  const [local, setLocal] = useState<Local>();
  useEffect(() => {
    setLocal(undefined);
    if (!token) return;
    const sub = liveQuery(() => db.lists.get(token)).subscribe({
      next: setLocal,
      error: () => {},
    });
    return () => sub.unsubscribe();
  }, [token]);
  return local;
}
export function visible(local: Local): State {
  let s = local.confirmed;
  for (const job of local.jobs)
    if (job.status === "pending") {
      try {
        s = apply(s, job.command.action).state;
      } catch {
        /* A conflicting operation remains in the durable queue for review. */
      }
    }
  return s;
}
export async function request<T>(
  token: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  const value = await res.json();
  if (!res.ok)
    throw Error(value.error ?? "The server could not save that change.");
  return value;
}
export function tokenFromUrl(): string {
  const token = location.hash.slice(1);
  return /^[a-zA-Z0-9_-]{43}$/.test(token) ? token : "";
}
export function randomToken(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function createCollection(backup?: unknown): Promise<string> {
  // Keep the credential + request identifier before sending so an interrupted creation is retryable.
  const fingerprint = JSON.stringify(backup ?? null);
  let creation:
    { token: string; requestId: string; backup?: unknown } | undefined;
  const saved = localStorage.getItem("shopping-list-creation");
  if (saved) {
    try {
      const v = JSON.parse(saved);
      if (JSON.stringify(v.backup ?? null) === fingerprint) creation = v;
    } catch {
      /* replace unusable draft */
    }
  }
  if (!creation) {
    creation = { token: randomToken(), requestId: uuid(), backup };
    localStorage.setItem("shopping-list-creation", JSON.stringify(creation));
  }
  const { state } = await request<{ state: State }>(
    "",
    "collections",
    creation,
  );
  await db.lists.put({
    token: creation.token,
    confirmed: state,
    jobs: [],
    usedAt: Date.now(),
  });
  localStorage.removeItem("shopping-list-creation");
  return creation.token;
}
export async function enqueue(token: string, action: Action) {
  await db.transaction("rw", db.lists, async () => {
    const local = await db.lists.get(token);
    if (!local) throw Error("Open the list before editing.");
    const before = visible(local);
    apply(before, action);
    const itemId =
      "id" in action
        ? action.id
        : "itemId" in action
          ? action.itemId
          : undefined;
    const item = before.items.find((i) => i.id === itemId);
    const shop = before.shops.find(
      (i) =>
        i.id ===
        (item?.shopId ?? ("shopId" in action ? action.shopId : itemId)),
    );

    local.jobs.push({
      command: {
        id: uuid(),
        epoch: local.confirmed.epoch,
        action,
      },
      status: "pending",
      context: { item, shop },
    });
    local.usedAt = Date.now();
    await db.lists.put(local);
  });
  window.dispatchEvent(new Event("shopping-sync"));
}
export async function discard(token: string, id: string) {
  await db.transaction("rw", db.lists, async () => {
    const local = await db.lists.get(token);
    if (local) {
      local.jobs = local.jobs.filter((j) => j.command.id !== id);
      await db.lists.put(local);
    }
  });
}
export async function retry(token: string, id: string) {
  await db.transaction("rw", db.lists, async () => {
    const local = await db.lists.get(token);
    if (!local) return;
    const job = local.jobs.find((j) => j.command.id === id);
    if (!job) return;
    const a = job.command.action;
    if (a.type === "item.rename") {
      const row = local.confirmed.items.find((i) => i.id === a.id);
      if (row) a.expected = row.nameRevision;
    }
    if (a.type === "shop.rename") {
      const row = local.confirmed.shops.find((i) => i.id === a.id);
      if (row) a.expected = row.nameRevision;
    }
    if (a.type === "item.add" || a.type === "item.rename")
      a.historyRevision = rememberedRevision(local.confirmed, a.name);
    job.command = {
      ...job.command,
      id: uuid(),
      epoch: local.confirmed.epoch,
    };
    job.status = "pending";
    delete job.message;
    await db.lists.put(local);
  });
  window.dispatchEvent(new Event("shopping-sync"));
}
export function useSync(token: string) {
  const [connection, setConnection] = useState<
      "connecting" | "online" | "offline"
    >("connecting"),
    [error, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    let stopped = false,
      busy = false,
      again = false,
      againRefresh = false,
      attempt = 0,
      nextTry = 0;
    const abort = new AbortController();
    let live = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    function scheduleFallback() {
      clearTimeout(fallbackTimer);
      if (stopped || live || document.visibilityState !== "visible") return;
      fallbackTimer = setTimeout(async () => {
        await run();
        scheduleFallback();
      }, 5000);
    }
    async function run(force = false, outboxOnly = false) {
      if (stopped) return;
      if (busy) {
        again = true;
        againRefresh ||= !outboxOnly;
        return;
      }
      if (!force && Date.now() < nextTry) return;
      busy = true;
      try {
        await syncLock("shopping-sync-" + token, abort.signal, async () => {
          for (let i = 0; i < 100 && !stopped; i++) {
            const current = await db.lists.get(token),
              job = current?.jobs.find((j) => j.status === "pending");
            if (!job) break;
            const answer = await request<{ state: State; result: Result }>(
              token,
              "commands",
              job.command,
              abort.signal,
            );
            await db.transaction("rw", db.lists, async () => {
              const fresh = await db.lists.get(token);
              if (!fresh) return;
              if (
                fresh.confirmed.epoch !== answer.state.epoch ||
                fresh.confirmed.revision <= answer.state.revision
              )
                fresh.confirmed = answer.state;
              if (answer.result.ok) {
                fresh.jobs = fresh.jobs.filter(
                  (j) => j.command.id !== job.command.id,
                );
                if (answer.result.canonicalId && "id" in job.command.action) {
                  const oldId = job.command.action.id;
                  fresh.jobs = fresh.jobs.map((j) => ({
                    ...j,
                    command: {
                      ...j.command,
                      action: remap(
                        j.command.action,
                        oldId,
                        answer.result.canonicalId!,
                      ),
                    },
                  }));
                }
              } else {
                const failed = fresh.jobs.find(
                  (j) => j.command.id === job.command.id,
                );
                if (failed) {
                  failed.status = "conflict";
                  failed.message = answer.result.message;
                }
              }
              await db.lists.put(fresh);
            });
          }
          if (!outboxOnly) {
            const { state } = await request<{ state: State }>(
              token,
              "state",
              undefined,
              abort.signal,
            );
            await db.transaction("rw", db.lists, async () => {
              const fresh = await db.lists.get(token);
              await db.lists.put({
                token,
                confirmed:
                  fresh &&
                  fresh.confirmed.epoch === state.epoch &&
                  fresh.confirmed.revision > state.revision
                    ? fresh.confirmed
                    : state,
                jobs: fresh?.jobs ?? [],
                usedAt: Date.now(),
              });
            });
          }
        });
        clearTimeout(retryTimer);
        attempt = 0;
        nextTry = 0;
        // A large outbox drains in bounded batches, without needing a poll tick.
        if (
          (await db.lists.get(token))?.jobs.some(
            (job) => job.status === "pending",
          )
        )
          again = true;
        setConnection("online");
        setError("");
      } catch (e) {
        if (!stopped) {
          setConnection("offline");
          setError(e instanceof Error ? e.message : "Unable to connect.");
          nextTry =
            Date.now() +
            Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)) +
            Math.random() * 500;
          clearTimeout(retryTimer);
          if (document.visibilityState === "visible")
            retryTimer = setTimeout(
              () => void run(),
              Math.max(1, Math.ceil(nextTry - Date.now())),
            );
        }
      } finally {
        busy = false;
        if (again && !stopped) {
          const refresh = againRefresh;
          again = false;
          againRefresh = false;
          void run(false, !refresh);
        }
      }
    }
    const liveUpdates = connectLiveUpdates({
      token,
      onConnected() {
        live = true;
        clearTimeout(fallbackTimer);
        void run(true);
      },
      onDisconnected() {
        live = false;
        scheduleFallback();
      },
      onRevision(revision) {
        // Our own mutation replies already contain the latest state.
        void db.lists.get(token).then((current) => {
          if (!stopped && (!current || revision > current.confirmed.revision))
            void run(true);
        });
      },
    });
    const trigger = () => void run(true);
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      liveUpdates.reconnect();
      trigger();
      scheduleFallback();
    };
    const reveal = () => {
      if (document.visibilityState === "visible") resume();
      else {
        clearTimeout(fallbackTimer);
        clearTimeout(retryTimer);
      }
    };
    void run(true);
    scheduleFallback();
    // Dexie broadcasts committed mutations across tabs; only pending work wakes
    // the sender. Confirmed-state notifications and heartbeats cause no snapshot requests.
    const outbox = liveQuery(() => db.lists.get(token)).subscribe({
      next(current) {
        if (!stopped && current?.jobs.some((job) => job.status === "pending"))
          void run(false, true);
      },
      error() {
        /* The normal sync path reports database failures. */
      },
    });
    window.addEventListener("shopping-sync", trigger);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", reveal);
    return () => {
      stopped = true;
      outbox.unsubscribe();
      abort.abort();
      liveUpdates.stop();
      clearTimeout(fallbackTimer);
      clearTimeout(retryTimer);
      window.removeEventListener("shopping-sync", trigger);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", reveal);
    };
  }, [token]);
  return { connection, error };
}
