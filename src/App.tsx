import { parseToken } from "../shared/tokens";
import { uuid } from "./platform";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { registerSW } from "virtual:pwa-register";
import {
  exportData,
  importData,
  normalise,
  rememberedRevision,
  suggestions,
  type Action,
  type Item,
  type State,
} from "../shared/model";
import {
  createCollection,
  db,
  discard,
  enqueue,
  retry,
  tokenFromUrl,
  useLocal,
  useSync,
  visible,
} from "./data";
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    basket: (
      <>
        <path d="m8 8 4-6 4 6M3 8h18l-2 13H5L3 8ZM9 12v5m6-5v5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
    edit: <path d="m4 16 12-12 4 4L8 20H4v-4Zm10-10 4 4" />,
    share: (
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m9 11 6-4M9 13l6 4" />
      </>
    ),
    history: <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    download: <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />,
    check: <path d="m5 12 4 4L19 6" />,
    grip: (
      <>
        <circle cx="9" cy="5" r="1" />
        <circle cx="15" cy="5" r="1" />
        <circle cx="9" cy="12" r="1" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="9" cy="19" r="1" />
        <circle cx="15" cy="19" r="1" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.basket}
    </svg>
  );
}
function Dialog({
  title,
  close,
  children,
  initialFocus,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  initialFocus?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    d.showModal();
    d.querySelector<HTMLElement>(
      initialFocus ?? "input,textarea,select",
    )?.focus();
    return () => {
      d.close();
      if (opener?.isConnected) {
        const target = opener.getClientRects().length
          ? opener
          : opener.closest("details")?.querySelector<HTMLElement>("summary");
        target?.focus({ preventScroll: true });
      }
    };
  }, [initialFocus]);
  return (
    <dialog ref={ref} onCancel={close} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function NameForm({
  initial = "",
  label = "Name",
  button = "Save changes",
  save,
}: {
  initial?: string;
  label?: string;
  button?: string;
  save: (name: string, merge: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(initial),
    [error, setError] = useState(""),
    [merge, setMerge] = useState(false),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save(name, merge);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)}>
      <label className="field">
        {label}
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
            setMerge(false);
          }}
          maxLength={200}
          required
        />
      </label>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {error.includes("merge") && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={merge}
            onChange={(e) => setMerge(e.target.checked)}
          />
          Combine the quantities into the existing item
        </label>
      )}
      <button className="primary full" disabled={busy}>
        {button}
      </button>
    </form>
  );
}
type Modal = {
  type:
    | "menu"
    | "sync"
    | "share"
    | "shops"
    | "history"
    | "import"
    | "open"
    | "edit-item"
    | "edit-shop"
    | "delete-shop";
  id?: string;
  name?: string;
  expected?: number;
};
export default function App() {
  const [token, setToken] = useState(() => {
      const saved = localStorage.getItem("shopping-list-last") ?? "";
      return tokenFromUrl() || (!location.hash ? parseToken(saved) : "");
    }),
    local = useLocal(token),
    { connection, error: networkError } = useSync(token),
    s = local ? visible(local) : undefined;
  const [shopId, setShopId] = useState(""),
    [input, setInput] = useState(""),
    [suggesting, setSuggesting] = useState(false),
    [activeSuggestion, setActiveSuggestion] = useState(-1),
    [modal, setModal] = useState<Modal | null>(null),
    [error, setError] = useState(
      location.hash && !tokenFromUrl()
        ? "That sharing link is incomplete or invalid."
        : "",
    ),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [recent, setRecent] = useState<Array<{ token: string; title: string }>>([]),
    [historyQuery, setHistoryQuery] = useState(""),
    [theme, setTheme] = useState(
      () => localStorage.getItem("shopping-list-theme") ?? "system",
    ),
    [offlineReady, setOfflineReady] = useState(false),
    [needsUpdate, setNeedsUpdate] = useState(false);
  const [backup, setBackup] = useState<{ raw: unknown; state: State } | null>(
      null,
    ),
    [undo, setUndo] = useState<Item | null>(null),
    [shareLink, setShareLink] = useState("");
  const update = useRef<((reload?: boolean) => Promise<void>) | null>(null),
    inputRef = useRef<HTMLInputElement>(null),
    listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hash = () => {
      setToken(tokenFromUrl());
      setModal(null);
      setInput("");
      setError(
        location.hash && !tokenFromUrl()
          ? "That sharing link is incomplete or invalid."
          : "",
      );
      setShopId("");
    };
    window.addEventListener("hashchange", hash);
    return () => window.removeEventListener("hashchange", hash);
  }, []);
  useEffect(() => {
    void db.lists
      .orderBy("usedAt")
      .reverse()
      .toArray()
      .then((rows) =>
        setRecent(
          rows.map((r) => ({ token: r.token, title: r.confirmed.title })),
        ),
      );
  }, [token, local?.confirmed.revision]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    applyTheme();
    media.addEventListener("change", applyTheme);
    localStorage.setItem("shopping-list-theme", theme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);
  useEffect(() => {
    update.current = registerSW({
      onOfflineReady: () => setOfflineReady(true),
      onNeedRefresh: () => setNeedsUpdate(true),
      onRegisterError: () =>
        setError("Offline setup failed. Reopen online to try again."),
    });
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.ready.then(() => setOfflineReady(true));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      setToast("");
      setUndo(null);
    }, 6500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (token) {
      localStorage.setItem("shopping-list-last", token);
      if (!location.hash) history.replaceState(null, "", "/#" + token);
    }
  }, [token]);
  const selected = s?.shops.find((x) => x.id === shopId) ?? s?.shops[0],
    rows = s?.items.filter((x) => x.shopId === selected?.id) ?? [],
    pending = local?.jobs.filter((j) => j.status === "pending").length ?? 0,
    conflicts = local?.jobs.filter((j) => j.status === "conflict") ?? [],
    options = s ? suggestions(s, input) : [];
  useEffect(() => {
    if (selected) {
      setShopId(selected.id);
      listRef.current?.scrollTo({ top: 0 });
      try {
        sessionStorage.setItem("shopping-selected-" + token, selected.id);
      } catch {
        /* optional preference */
      }
    }
  }, [selected?.id, token]);
  useEffect(() => {
    setShopId(sessionStorage.getItem("shopping-selected-" + token) ?? "");
  }, [token]);
  async function change(action: Action) {
    setError("");
    try {
      await enqueue(token, action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      throw e;
    }
  }
  function act(action: Action) {
    void change(action).catch(() => {});
  }
  async function create(raw?: unknown) {
    setBusy(true);
    setError("");
    try {
      const next = await createCollection(raw);
      location.hash = next;
      setToken(next);
      setModal(null);
      setBackup(null);
      setToast("Your list is ready. Share it with your people.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create list.");
    } finally {
      setBusy(false);
    }
  }
  async function add(name = input) {
    if (!selected || !s) return;
    try {
      await change({
        type: "item.add",
        id: uuid(),
        shopId: selected.id,
        name,
        quantity: 1,
        historyRevision: rememberedRevision(s, name),
      });
      setInput("");
      setSuggesting(false);
      setActiveSuggestion(-1);
      inputRef.current?.focus();
    } catch {
      /* The form error remains visible. */
    }
  }
  function download() {
    if (!s) return;
    const blob = new Blob(
        [
          JSON.stringify(
            {
              ...exportData(s, pending + conflicts.length),
              recoveryChanges: local?.jobs ?? [],
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `shopping-list-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const shop = s?.shops.find((i) => i.id === modal?.id);
  const syncText = conflicts.length
    ? "Needs attention"
    : pending
      ? connection === "offline"
        ? `Offline · ${pending} pending`
        : `Syncing ${pending} change${pending === 1 ? "" : "s"}`
      : connection === "online"
        ? "All changes saved"
        : local
          ? "Offline · saved on this device"
          : "Connecting…";
  return (
    <div className={s ? "app shopping-mode" : "app"}>
      <div
        className={s ? "workspace shopping-shell" : "workspace welcome-shell"}
      >
        <header className="shopping-header">
          {s ? (
            <div className="shop-bar">
              <div
                className="shop-tabs"
                role="group"
                aria-label="Choose a shop"
              >
                {s.shops.map((x) => (
                  <button
                    key={x.id}
                    className={
                      selected?.id === x.id ? "shop-tab selected" : "shop-tab"
                    }
                    aria-pressed={selected?.id === x.id}
                    onClick={() => {
                      setShopId(x.id);
                      setInput("");
                      setSuggesting(false);
                    }}
                  >
                    {x.name}
                    <span>
                      {s.items.filter((i) => i.shopId === x.id).length}
                    </span>
                  </button>
                ))}
              </div>
              <button
                className="icon-button hamburger"
                aria-label="Open menu"
                aria-haspopup="dialog"
                onClick={() => {
                  setSuggesting(false);
                  setModal({ type: "menu" });
                }}
              >
                <Icon name="menu" size={24} />
                {(conflicts.length > 0 || needsUpdate) && (
                  <span className="menu-badge" aria-label="Needs attention" />
                )}
              </button>
            </div>
          ) : (
            <div className="welcome-header">
              <span className="brand">
                <span className="brand-mark">
                  <Icon name="basket" size={24} />
                </span>
                shopping<span className="brand-dot">.</span>
              </span>
              <button
                className="icon-button hamburger"
                aria-label="Open menu"
                aria-haspopup="dialog"
                onClick={() => setModal({ type: "menu" })}
              >
                <Icon name="menu" size={24} />
              </button>
            </div>
          )}
        </header>
        <main aria-label="Shopping list">
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {!token ? (
            <section className="welcome">
              <span className="eyebrow">SMALL THINGS. SORTED.</span>
              <div className="welcome-basket">
                <Icon name="basket" size={66} />
              </div>
              <h1>
                A little less
                <br />
                to remember<span className="heading-dot">.</span>
              </h1>
              <p>
                From the kitchen table to the supermarket aisle.
                <br />
                One simple list, shared with your people.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void create()}
              >
                <Icon name="plus" size={18} />
                Create a shopping list
                <Icon name="arrow" size={17} />
              </button>
              <button
                className="text-button"
                onClick={() => setModal({ type: "import" })}
              >
                Bring your old list along ↗
              </button>
              <p className="small">No login. Share a link. Shop together.</p>
              {recent.length > 0 && (
                <div className="recent-list">
                  <span className="eyebrow">YOUR RECENT LISTS</span>
                  {recent.map((r, i) => (
                    <button
                      key={r.token}
                      onClick={() => {
                        location.hash = r.token;
                      }}
                    >
                      {r.title}
                      {recent.length > 1 ? ` · ${i + 1}` : ""}
                      <Icon name="arrow" size={16} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : !s ? (
            <section className="empty-state">
              <Icon name="basket" size={44} />
              <h1>
                {connection === "offline"
                  ? "Cannot open this list yet."
                  : "Getting your list ready…"}
              </h1>
              <p>
                {networkError || "Fetching your shops and remembered items."}
              </p>
              <button
                className="secondary"
                onClick={() => window.dispatchEvent(new Event("shopping-sync"))}
              >
                Try again
              </button>
              <button
                className="text-button"
                onClick={() => {
                  location.hash = "";
                  setToken("");
                }}
              >
                Back to your lists
              </button>
            </section>
          ) : (
            <>
              <h1 className="sr-only">
                {selected ? `${selected.name} shopping list` : "Shopping list"}
              </h1>
              {selected && (
                <form
                  className="add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void add();
                  }}
                >
                  <div className="autocomplete">
                    <Icon name="plus" size={19} />
                    <input
                      ref={inputRef}
                      aria-label="Add an item"
                      placeholder="What do we need?"
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        setSuggesting(true);
                        setActiveSuggestion(-1);
                      }}
                      onFocus={() => setSuggesting(true)}
                      onBlur={() => setTimeout(() => setSuggesting(false), 150)}
                      maxLength={200}
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-controls="suggestions"
                      aria-expanded={suggesting && options.length > 0}
                      aria-activedescendant={
                        activeSuggestion >= 0
                          ? `suggestion-${activeSuggestion}`
                          : undefined
                      }
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setActiveSuggestion((n) =>
                            Math.min(n + 1, options.length - 1),
                          );
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setActiveSuggestion((n) => Math.max(-1, n - 1));
                        }
                        if (e.key === "Escape") {
                          setSuggesting(false);
                          setActiveSuggestion(-1);
                        }
                        if (
                          e.key === "Enter" &&
                          suggesting &&
                          activeSuggestion >= 0 &&
                          options[activeSuggestion]
                        ) {
                          e.preventDefault();
                          void add(options[activeSuggestion].name);
                        }
                      }}
                    />
                    {suggesting && options.length > 0 && (
                      <ul id="suggestions" role="listbox">
                        {options.map((o, i) => (
                          <li
                            key={normalise(o.name)}
                            id={`suggestion-${i}`}
                            role="option"
                            aria-selected={activeSuggestion === i}
                          >
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => void add(o.name)}
                            >
                              <Icon name="history" size={16} />
                              {o.name}
                              <span>Add ↗</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button className="primary" disabled={!input.trim()}>
                    Add item
                    <Icon name="plus" size={17} />
                  </button>
                </form>
              )}
              <div
                ref={listRef}
                className="shopping-list-scroll"
                role="region"
                aria-label={
                  selected ? `${selected.name} items` : "Shopping items"
                }
                tabIndex={0}
              >
                <div className="items">
                  {rows.map((row, i) => (
                    <ItemCard
                      key={row.id}
                      row={row}
                      rows={rows}
                      index={i}
                      act={act}
                      edit={() =>
                        setModal({
                          type: "edit-item",
                          id: row.id,
                          name: row.name,
                          expected: row.nameRevision,
                        })
                      }
                      remove={() => {
                        void change({ type: "item.delete", id: row.id })
                          .then(() => {
                            setUndo(row);
                            setToast(
                              `${row.name} removed. Still remembered for next time.`,
                            );
                          })
                          .catch(() => {});
                      }}
                      forget={() => {
                        void change({
                          type: "history.forget",
                          name: row.name,
                          itemId: row.id,
                        })
                          .then(() =>
                            setToast(`${row.name} removed and forgotten.`),
                          )
                          .catch(() => {});
                      }}
                    />
                  ))}
                </div>
                {rows.length === 0 && (
                  <section className="empty-state">
                    <div className="empty-basket">
                      <Icon name="basket" size={42} />
                    </div>
                    <h2>
                      {selected
                        ? "A fresh start for this shop."
                        : "Every list starts somewhere."}
                    </h2>
                    <p>
                      {selected
                        ? "Add something above. We’ll remember it for next time."
                        : "Add a shop, then start filling your list."}
                    </p>
                    {!selected && (
                      <button
                        className="primary"
                        onClick={() => setModal({ type: "shops" })}
                      >
                        <Icon name="plus" size={17} />
                        Add your first shop
                      </button>
                    )}
                  </section>
                )}
              </div>
            </>
          )}
        </main>
        <span className="sr-only" role="status" aria-label="Sync status">
          {syncText}
        </span>
      </div>
      {modal?.type === "menu" && (
        <Dialog
          title="Menu"
          close={() => setModal(null)}
          initialFocus=".menu-options button:not(:disabled)"
        >
          <nav className="menu-options" aria-label="Shopping options">
            <button
              disabled={!s}
              onClick={() => {
                setShareLink(location.origin + "/#" + token);
                setModal({ type: "share" });
              }}
            >
              <Icon name="share" />
              Share list
            </button>
            <button disabled={!s} onClick={() => setModal({ type: "history" })}>
              <Icon name="history" />
              Remembered items
            </button>
            <button disabled={!s} onClick={() => setModal({ type: "shops" })}>
              <Icon name="settings" />
              Manage shops
            </button>
            <button
              disabled={!s}
              onClick={() => {
                download();
                setModal(null);
              }}
            >
              <Icon name="download" />
              Back up
            </button>
            <button onClick={() => setModal({ type: "import" })}>
              <Icon name="plus" />
              Import backup
            </button>
            <button onClick={() => setModal({ type: "open" })}>
              <Icon name="basket" />
              Open a list
            </button>
            <button disabled={busy} onClick={() => void create()}>
              <Icon name="plus" />
              Create another list
            </button>
            {s && (
              <button onClick={() => setModal({ type: "sync" })}>
                <Icon name="check" />
                <span>
                  Sync status<small>{syncText}</small>
                </span>
              </button>
            )}
          </nav>
          <label className="field menu-theme">
            Theme
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          {needsUpdate && (
            <div className="notice">
              A fresh version is ready.
              <button onClick={() => void update.current?.(true)}>
                Update app
              </button>
            </div>
          )}
          <p className="small menu-status">
            {offlineReady
              ? "Available offline"
              : window.isSecureContext
                ? "Preparing offline use"
                : "HTTPS needed for offline use"}
          </p>
        </Dialog>
      )}
      {modal?.type === "sync" && s && (
        <Dialog title="Sync status" close={() => setModal(null)}>
          <p>
            {connection === "offline"
              ? networkError
              : "Your changes are saved locally first, then shared with everyone using this link."}
          </p>
          {pending > 0 && (
            <p>{pending} change(s) waiting to be confirmed by the server.</p>
          )}
          {conflicts.map((job) => (
            <div className="conflict" key={job.command.id}>
              <strong>
                {
                  {
                    "shop.add": "Add a shop",
                    "shop.rename": "Rename a shop",
                    "shop.delete": "Remove a shop",
                    "shop.move": "Reorder a shop",
                    "item.add": "Add an item",
                    "item.rename": "Rename an item",
                    "item.delta": "Change a quantity",
                    "item.delete": "Remove an item",
                    "item.move": "Reorder an item",
                    "history.forget": "Forget an item",
                    "history.remember": "Remember an item",
                  }[job.command.action.type]
                }
              </strong>
              <p>{job.message}</p>
              {job.context?.item && (
                <p>
                  Item: {job.context.item.name} · quantity{" "}
                  {job.context.item.quantity} · {job.context.shop?.name}
                </p>
              )}
              {"name" in job.command.action && (
                <p>Your name: {job.command.action.name}</p>
              )}
              {job.command.action.type === "item.delta" && (
                <p>
                  Your change:{" "}
                  {job.command.action.delta > 0 ? "increase" : "decrease"}{" "}
                  quantity by {Math.abs(job.command.action.delta)}.
                </p>
              )}
              {job.context?.item &&
                selected &&
                !s.items.some((i) => i.id === job.context!.item!.id) && (
                  <button
                    className="secondary"
                    onClick={() => {
                      const item = job.context!.item!,
                        action = job.command.action;
                      const name =
                        action.type === "item.rename" ? action.name : item.name;
                      const quantity = Math.min(
                        999,
                        Math.max(
                          1,
                          item.quantity +
                            (action.type === "item.delta" ? action.delta : 0),
                        ),
                      );
                      void change({
                        type: "item.add",
                        id: uuid(),
                        shopId: selected.id,
                        name,
                        quantity,
                        historyRevision: rememberedRevision(s, name),
                      })
                        .then(() => discard(token, job.command.id))
                        .catch(() => {});
                    }}
                  >
                    Recover item in {selected.name}
                  </button>
                )}
              <button
                className="secondary"
                onClick={() => void retry(token, job.command.id)}
              >
                Reapply to current list
              </button>
              <button
                className="text-button"
                onClick={() => void discard(token, job.command.id)}
              >
                Discard this change
              </button>
            </div>
          ))}
          <button className="text-button" onClick={download}>
            Export a recovery copy
          </button>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
          {undo && s && (
            <button
              onClick={() => {
                const row = undo;
                void change({
                  type: "item.add",
                  id: uuid(),
                  shopId: row.shopId,
                  name: row.name,
                  quantity: row.quantity,
                  historyRevision: rememberedRevision(s, row.name),
                })
                  .then(() => {
                    setUndo(null);
                    setToast("Item restored.");
                  })
                  .catch(() => {});
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
      {modal?.type === "share" && (
        <Dialog title="Shop better together" close={() => setModal(null)}>
          <p>
            Anyone with this link can see and edit every shop and remembered
            item. No sign-in needed.
          </p>
          <label className="field">
            Your shared list link
            <input
              readOnly
              value={shareLink || location.origin + "/#" + token}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button
            className="primary full"
            onClick={() => {
              if (!navigator.clipboard) {
                document
                  .querySelector<HTMLInputElement>("dialog input[readonly]")
                  ?.select();
                return;
              }
              void navigator.clipboard
                .writeText(shareLink || location.origin + "/#" + token)
                .then(() => setToast("List link copied."))
                .catch(() => setError("Select the link and copy it manually."));
            }}
          >
            <Icon name="share" size={17} />
            {navigator.clipboard ? "Copy sharing link" : "Select link to copy"}
          </button>
          <p className="small">
            Keep the link somewhere safe. It’s the key to this list. Shopping
            data is stored on our server.
          </p>
        </Dialog>
      )}
      {modal?.type === "open" && (
        <Dialog title="Your shopping lists" close={() => setModal(null)}>
          <NameForm
            label="Paste a shared list link or code"
            button="Open list"
            save={async (name) => {
              let value = name.trim();
              try {
                if (value.includes("://")) value = new URL(value).hash.slice(1);
              } catch {
                throw Error("Paste a valid list link.");
              }
              value = parseToken(value.replace(/^#/, ""));
              if (!value)
                throw Error("This does not look like a shopping list link.");
              location.hash = value;
              setToken(value);
              setModal(null);
            }}
          />
          {recent.map((r, i) => (
            <button
              className="recent-entry"
              key={r.token}
              onClick={() => {
                location.hash = r.token;
                setToken(r.token);
                setModal(null);
              }}
            >
              {r.title}
              {recent.length > 1 ? ` · ${i + 1}` : ""}
              <Icon name="arrow" size={17} />
            </button>
          ))}
          <div className="dialog-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void create()}
            >
              Create another list
            </button>
            <button
              className="text-button"
              onClick={() => setModal({ type: "import" })}
            >
              Import backup
            </button>
          </div>
        </Dialog>
      )}
      {modal?.type === "shops" && s && (
        <Dialog title="Your shops" close={() => setModal(null)}>
          <p>
            A place for every stop. Names and order are shared with everyone on
            this list.
          </p>
          <div className="manage-list">
            {s.shops.map((x, i) => (
              <div key={x.id}>
                <strong>{x.name}</strong>
                <button
                  className="icon-button"
                  disabled={i === 0}
                  aria-label={`Move ${x.name} up`}
                  onClick={() =>
                    act({
                      type: "shop.move",
                      id: x.id,
                      beforeId: s.shops[i - 1].id,
                    })
                  }
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  disabled={i === s.shops.length - 1}
                  aria-label={`Move ${x.name} down`}
                  onClick={() =>
                    act({
                      type: "shop.move",
                      id: x.id,
                      beforeId: s.shops[i + 2]?.id ?? null,
                    })
                  }
                >
                  ↓
                </button>
                <button
                  className="icon-button"
                  aria-label={`Edit ${x.name}`}
                  onClick={() =>
                    setModal({
                      type: "edit-shop",
                      id: x.id,
                      name: x.name,
                      expected: x.nameRevision,
                    })
                  }
                >
                  <Icon name="edit" size={17} />
                </button>
                <button
                  className="icon-button danger-text"
                  aria-label={`Delete ${x.name}`}
                  onClick={() => setModal({ type: "delete-shop", id: x.id })}
                >
                  <Icon name="trash" size={17} />
                </button>
              </div>
            ))}
          </div>
          <NameForm
            label="New shop name"
            button="Add shop"
            save={async (name) => {
              await change({ type: "shop.add", id: uuid(), name });
              setModal(null);
              setToast("Shop added.");
            }}
          />
        </Dialog>
      )}
      {modal?.type === "edit-shop" && s && (
        <Dialog key={modal.id} title="Edit shop" close={() => setModal(null)}>
          <NameForm
            initial={modal.name}
            label="Shop name"
            save={async (name) => {
              await change({
                type: "shop.rename",
                id: modal.id!,
                name,
                expected: modal.expected!,
              });
              setModal(null);
            }}
          />
        </Dialog>
      )}
      {modal?.type === "delete-shop" && shop && s && (
        <Dialog title={`Delete ${shop.name}?`} close={() => setModal(null)}>
          <p>
            This removes the shop and its{" "}
            {s.items.filter((i) => i.shopId === shop.id).length} item(s) for
            everyone. Remembered items will stay available.
          </p>
          <button
            className="danger full"
            onClick={() => {
              void change({ type: "shop.delete", id: shop.id })
                .then(() => setModal(null))
                .catch(() => {});
            }}
          >
            Delete shop
          </button>
        </Dialog>
      )}
      {modal?.type === "edit-item" && s && (
        <Dialog key={modal.id} title="Edit item" close={() => setModal(null)}>
          <NameForm
            initial={modal.name}
            label="Item name"
            save={async (name, merge) => {
              await change({
                type: "item.rename",
                id: modal.id!,
                name,
                expected: modal.expected!,
                merge,
                historyRevision: rememberedRevision(s, name),
              });
              setModal(null);
            }}
          />
        </Dialog>
      )}
      {modal?.type === "history" && s && (
        <Dialog title="Remembered items" close={() => setModal(null)}>
          <p>
            Shared between your shops. Forget a suggestion without removing
            other shops’ items.
          </p>
          <label className="field">
            Search remembered items
            <input
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              placeholder="Find an item…"
            />
          </label>
          <div className="history-list">
            {Object.values(s.history)
              .filter((h) =>
                normalise(h.name).includes(normalise(historyQuery)),
              )
              .sort((a, b) => b.lastUsed - a.lastUsed)
              .map((h) => (
                <div key={normalise(h.name)}>
                  <span>
                    {h.name}
                    {h.forgotten && <small>Forgotten</small>}
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      act({
                        type: h.forgotten
                          ? "history.remember"
                          : "history.forget",
                        name: h.name,
                      })
                    }
                  >
                    {h.forgotten ? "Remember" : "Forget"}
                  </button>
                </div>
              ))}
            {Object.keys(s.history).length === 0 && (
              <p>Add your first item and it will appear here.</p>
            )}
          </div>
        </Dialog>
      )}
      {modal?.type === "import" && (
        <Dialog
          title="Bring your list along"
          close={() => {
            setModal(null);
            setBackup(null);
          }}
        >
          <p>
            Choose a JSON backup from the old shopping app or this one. Import
            creates a new shared list; it never replaces your existing list.
          </p>
          <label className="field">
            Shopping list backup
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                setError("");
                setBackup(null);
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  setError("Choose a backup smaller than 5 MiB.");
                  return;
                }
                void file
                  .text()
                  .then((text) => {
                    const raw = JSON.parse(text),
                      state = importData(raw, "preview", () => uuid());
                    setBackup({ raw, state });
                  })
                  .catch((e) =>
                    setError(
                      e instanceof Error ? e.message : "Invalid backup.",
                    ),
                  );
              }}
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {backup && (
            <div className="import-preview">
              <h3>Your backup is ready</h3>
              <p>
                {backup.state.shops.length} shops · {backup.state.items.length}{" "}
                items · {Object.keys(backup.state.history).length} remembered
                items
              </p>
              <p>{backup.state.shops.map((x) => x.name).join(" · ")}</p>
              <p className="small">
                Every row is kept. Old purchased checkboxes are ignored.
              </p>
              <button
                className="primary full"
                disabled={busy}
                onClick={() => void create(backup.raw)}
              >
                Create list from backup
              </button>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
function ItemCard({
  row,
  rows,
  index,
  act,
  edit,
  remove,
  forget,
}: {
  row: Item;
  rows: Item[];
  index: number;
  act: (a: Action) => void;
  edit: () => void;
  remove: () => void;
  forget: () => void;
}) {
  const [side, setSide] = useState<"edit" | "forget" | null>(null),
    [menuUp, setMenuUp] = useState(false),
    [dragging, setDragging] = useState(false),
    [over, setOver] = useState(false),
    start = useRef<{ x: number; y: number } | null>(null),
    drop = useRef<string | null>(null),
    handle = useRef<HTMLButtonElement>(null);
  return (
    <div
      className={"row-wrap " + (over ? "drop-over" : "")}
      data-item-id={row.id}
    >
      {side && (
        <button
          className={"revealed " + side}
          onClick={() => {
            setSide(null);
            if (side === "edit") edit();
            else forget();
          }}
        >
          <Icon name={side === "edit" ? "edit" : "trash"} size={18} />
          {side === "edit" ? "Edit" : "Remove & forget"}
        </button>
      )}
      <article
        className={
          "item-card " +
          (side ? "reveal-" + side : "") +
          (dragging ? " dragging" : "")
        }
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button,summary,details,input"))
            return;
          start.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          if (!start.current) return;
          const dx = e.clientX - start.current.x,
            dy = e.clientY - start.current.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5)
            setSide(dx > 0 ? "edit" : "forget");
          else setSide(null);
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        <button
          ref={handle}
          type="button"
          className="drag-handle icon-button"
          aria-label={`Drag ${row.name} to reorder`}
          onPointerDown={(e) => {
            e.stopPropagation();
            setSide(null);
            setDragging(true);
            drop.current = rows[index + 1]?.id ?? null;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const el = document
              .elementFromPoint(e.clientX, e.clientY)
              ?.closest<HTMLElement>("[data-item-id]");
            if (el && el.dataset.itemId !== row.id) {
              const target = rows.findIndex((i) => i.id === el.dataset.itemId);
              if (target >= 0) {
                const below =
                  e.clientY >
                  el.getBoundingClientRect().top +
                    el.getBoundingClientRect().height / 2;
                drop.current = below
                  ? (rows[target + 1]?.id ?? null)
                  : rows[target].id;
                setOver(true);
              }
            }
            const scroller = e.currentTarget.closest<HTMLElement>(
              ".shopping-list-scroll",
            );
            if (scroller) {
              const bounds = scroller.getBoundingClientRect();
              if (e.clientY < bounds.top + 45) scroller.scrollBy(0, -12);
              if (e.clientY > bounds.bottom - 45) scroller.scrollBy(0, 12);
            }
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
              setDragging(false);
              setOver(false);
              act({ type: "item.move", id: row.id, beforeId: drop.current });
            }
          }}
          onPointerCancel={() => {
            setDragging(false);
            setOver(false);
          }}
          title="Drag to reorder. More actions also has move controls."
        >
          <Icon name="grip" size={21} />
        </button>
        <span className="item-name">{row.name}</span>
        <div className="quantity">
          <button
            className="icon-button"
            disabled={row.quantity <= 1}
            aria-label={`Decrease ${row.name}`}
            onClick={() => act({ type: "item.delta", id: row.id, delta: -1 })}
          >
            <Icon name="minus" size={15} />
          </button>
          <span aria-label={`Quantity for ${row.name}`}>{row.quantity}</span>
          <button
            className="icon-button"
            disabled={row.quantity >= 999}
            aria-label={`Increase ${row.name}`}
            onClick={() => act({ type: "item.delta", id: row.id, delta: 1 })}
          >
            <Icon name="plus" size={15} />
          </button>
        </div>
        <span className="row-divider" />
        <button
          className="icon-button delete-row"
          aria-label={`Delete ${row.name}`}
          onClick={remove}
        >
          <Icon name="trash" size={17} />
        </button>
        <details
          className={menuUp ? "row-menu menu-up" : "row-menu"}
          onToggle={(e) => {
            if (!e.currentTarget.open) return;
            const list = e.currentTarget.closest(".shopping-list-scroll");
            if (list)
              setMenuUp(
                e.currentTarget.getBoundingClientRect().bottom + 180 >
                  list.getBoundingClientRect().bottom,
              );
          }}
        >
          <summary
            role="button"
            className="icon-button"
            aria-label={`More actions for ${row.name}`}
          >
            ···
          </summary>
          <div>
            <button
              onClick={(e) => {
                edit();
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              Edit name
            </button>
            <button
              onClick={(e) => {
                forget();
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              Remove & forget
            </button>
            <button
              disabled={index === 0}
              onClick={(e) => {
                act({
                  type: "item.move",
                  id: row.id,
                  beforeId: rows[index - 1].id,
                });
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              Move up
            </button>
            <button
              disabled={index === rows.length - 1}
              onClick={(e) => {
                act({
                  type: "item.move",
                  id: row.id,
                  beforeId: rows[index + 2]?.id ?? null,
                });
                e.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              Move down
            </button>
          </div>
        </details>
      </article>
    </div>
  );
}
