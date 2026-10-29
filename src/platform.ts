// Plain-HTTP LAN previews do not expose randomUUID or Web Locks.
// getRandomValues remains cryptographically strong in that context.
export function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function syncLock(
  name: string,
  signal: AbortSignal,
  work: () => Promise<void>,
) {
  if (navigator.locks) await navigator.locks.request(name, { signal }, work);
  else if (!signal.aborted) await work();
  // The per-tab sync loop remains serial. Cross-tab HTTP retries are deduplicated
  // by the server even when the secure-context Web Locks API is unavailable.
}
