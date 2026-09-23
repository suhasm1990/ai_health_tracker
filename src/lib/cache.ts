/**
 * Process-local TTL cache with in-flight request de-duplication.
 * Keys are namespaced per user by the caller; entries are evicted lazily and
 * the map is capped so long-running processes cannot grow without bound.
 */

interface Entry {
  value: unknown;
  expiresAt: number;
}

const MAX_ENTRIES = 500;
const store = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) evict();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(prefix?: string): void {
  for (const map of [store, inFlight]) {
    if (!prefix) map.clear();
    else for (const key of map.keys()) if (key.startsWith(prefix)) map.delete(key);
  }
}

/**
 * Returns the cached value, joins an identical in-flight request, or runs `fetcher`.
 * `force` skips the stored value but never starts a second upstream batch while one is running.
 */
export function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  { force = false } = {}
): Promise<T> {
  if (!force) {
    const hit = getCached<T>(key);
    if (hit !== undefined) return Promise.resolve(hit);
  }
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const promise = fetcher()
    .then((value) => {
      setCached(key, value, ttlMs);
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function evict(): void {
  const now = Date.now();
  for (const [key, entry] of store) if (entry.expiresAt <= now) store.delete(key);
  // Still full: drop the oldest insertions (Map preserves insertion order).
  const overflow = store.size - MAX_ENTRIES + 1;
  if (overflow > 0) for (const key of Array.from(store.keys()).slice(0, overflow)) store.delete(key);
}
