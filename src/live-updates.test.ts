import { afterEach, expect, it, vi } from "vitest";
import { connectLiveUpdates } from "./live-updates";
const stops: Array<() => void> = [];
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.useRealTimers();
});
function setup() {
  vi.useFakeTimers();
  const connected = vi.fn(),
    disconnected = vi.fn(),
    revision = vi.fn();
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streams.push(controller);
        init?.signal?.addEventListener(
          "abort",
          () => controller.error(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  });
  const live = connectLiveUpdates({
    token: "x".repeat(43),
    onConnected: connected,
    onDisconnected: disconnected,
    onRevision: revision,
    fetcher,
  });
  stops.push(live.stop);
  const send = (text: string) =>
    streams.at(-1)!.enqueue(new TextEncoder().encode(text));
  return { live, send, connected, disconnected, revision, fetcher };
}
it("heartbeats keep a single live connection without refreshing revisions", async () => {
  const t = setup();
  await vi.advanceTimersByTimeAsync(0);
  t.send("data: 3\n\n");
  await vi.advanceTimersByTimeAsync(0);
  expect(t.connected).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 5; i++) {
    await vi.advanceTimersByTimeAsync(15000);
    t.send(": heartbeat\n\n");
    await vi.advanceTimersByTimeAsync(0);
  }
  expect(t.fetcher).toHaveBeenCalledTimes(1);
  expect(t.connected).toHaveBeenCalledTimes(1);
  expect(t.revision).not.toHaveBeenCalled();
  expect(t.disconnected).not.toHaveBeenCalled();
  t.send("data: 4\n\n");
  await vi.advanceTimersByTimeAsync(0);
  expect(t.revision).toHaveBeenCalledWith(4);
});
it("marks a silent connection unavailable and reconnects", async () => {
  const t = setup();
  await vi.advanceTimersByTimeAsync(0);
  t.send("data: 1\n\n");
  await vi.advanceTimersByTimeAsync(45000);
  expect(t.disconnected).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect(t.fetcher).toHaveBeenCalledTimes(2);
  t.send("data: 1\n\n");
  await vi.advanceTimersByTimeAsync(0);
  expect(t.connected).toHaveBeenCalledTimes(2);
});
it("times out a connection that never sends its first event", async () => {
  const t = setup();
  await vi.advanceTimersByTimeAsync(10000);
  expect(t.connected).not.toHaveBeenCalled();
  expect(t.disconnected).toHaveBeenCalledTimes(1);
});
it("reconnects promptly when explicitly resumed after failure", async () => {
  const t = setup();
  await vi.advanceTimersByTimeAsync(10000);
  t.live.reconnect();
  await vi.advanceTimersByTimeAsync(0);
  expect(t.fetcher).toHaveBeenCalledTimes(2);
});
it("stopping removes connection and retry timers", async () => {
  const t = setup();
  await vi.advanceTimersByTimeAsync(0);
  t.send("data: 1\n\n");
  await vi.advanceTimersByTimeAsync(0);
  t.live.stop();
  await vi.advanceTimersByTimeAsync(120000);
  expect(t.fetcher).toHaveBeenCalledTimes(1);
  expect(t.disconnected).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
