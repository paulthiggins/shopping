const CONNECT_TIMEOUT = 10_000;
// The server sends a heartbeat every 15 seconds; tolerate two missed heartbeats.
const STALE_TIMEOUT = 45_000;

type Options = {
  token: string;
  onConnected: () => void;
  onDisconnected: () => void;
  onRevision: (revision: number) => void;
  fetcher?: typeof fetch;
};

/** Keep a live notification stream, without fetching list snapshots on heartbeats. */
export function connectLiveUpdates({
  token,
  onConnected,
  onDisconnected,
  onRevision,
  fetcher = fetch,
}: Options) {
  let stopped = false;
  let healthy = false;
  let lastTraffic = 0;
  let failures = 0;
  let retryNow = false;
  let connection: AbortController | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let wakeRetry: (() => void) | undefined;

  async function listen() {
    while (!stopped) {
      const controller = new AbortController();
      connection = controller;
      const armWatchdog = (ms: number) => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => controller.abort(), ms);
      };
      armWatchdog(CONNECT_TIMEOUT);
      try {
        const response = await fetcher("/api/events", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        });
        if (
          !response.ok ||
          !response.body ||
          !response.headers.get("content-type")?.startsWith("text/event-stream")
        ) {
          void response.body?.cancel();
          throw Error("Live connection unavailable.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (!stopped) {
            const part = await reader.read();
            if (part.done) break;
            buffer += decoder.decode(part.value, { stream: true });
            if (buffer.length > 65_536) throw Error("Invalid event stream.");
            let boundary: number;
            while ((boundary = buffer.indexOf("\n\n")) !== -1) {
              const lines = buffer.slice(0, boundary).split("\n");
              buffer = buffer.slice(boundary + 2);
              const data = lines
                .find((line) => line.startsWith("data:"))
                ?.slice(5)
                .trim();
              const heartbeat = lines.some((line) => line.startsWith(":"));
              const revision = data === undefined ? undefined : Number(data);
              const validRevision =
                revision !== undefined &&
                Number.isSafeInteger(revision) &&
                revision >= 0;
              if (!heartbeat && !validRevision) continue;
              lastTraffic = Date.now();
              armWatchdog(STALE_TIMEOUT);
              if (!healthy) {
                healthy = true;
                failures = 0;
                // Each connection needs one fresh snapshot, including recovery after suspension.
                onConnected();
              } else if (validRevision) {
                onRevision(revision!);
              }
              // Comment heartbeats only confirm liveness; they never refresh the list.
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
      } catch {
        // The caller enables fallback refreshes while reconnection is attempted.
      } finally {
        clearTimeout(watchdog);
        controller.abort();
        connection = undefined;
        healthy = false;
        if (!stopped) onDisconnected();
      }
      if (stopped) break;
      const delay = Math.min(30_000, 5_000 * 2 ** Math.min(failures++, 3));
      if (!retryNow) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(retryTimer);
            wakeRetry = undefined;
            resolve();
          };
          wakeRetry = finish;
          retryTimer = setTimeout(finish, delay);
        });
      }
      retryNow = false;
    }
  }
  void listen();
  return {
    reconnect() {
      if (stopped || (healthy && Date.now() - lastTraffic < STALE_TIMEOUT))
        return;
      retryNow = true;
      connection?.abort();
      wakeRetry?.();
    },
    stop() {
      stopped = true;
      clearTimeout(watchdog);
      clearTimeout(retryTimer);
      connection?.abort();
      wakeRetry?.();
    },
  };
}
