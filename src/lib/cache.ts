/**
 * In-memory cache with TTL and in-flight request deduplication.
 * Prevents redundant external Google Health API calls and collapses concurrent requests.
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheItem<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

export function getCached<T>(key: string, ttlMs: number): T | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > ttlMs) {
    memoryCache.delete(key);
    return null;
  }
  return item.data as T;
}

export function setCached<T>(key: string, data: T): void {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    memoryCache.clear();
    inFlightRequests.clear();
    return;
  }
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(keyPrefix)) {
      memoryCache.delete(key);
    }
  }
  for (const key of Array.from(inFlightRequests.keys())) {
    if (key.startsWith(keyPrefix)) {
      inFlightRequests.delete(key);
    }
  }
}

export async function fetchWithCache<T>(
  key: string,
  ttlMs: number,
  forceRefresh: boolean,
  fetchFn: () => Promise<T>
): Promise<T> {
  if (!forceRefresh) {
    const cached = getCached<T>(key, ttlMs);
    if (cached !== null) {
      return cached;
    }
    // Return in-flight promise if another request is already fetching this key
    const inFlight = inFlightRequests.get(key);
    if (inFlight) {
      return inFlight as Promise<T>;
    }
  }

  const promise = fetchFn()
    .then((data) => {
      setCached(key, data);
      inFlightRequests.delete(key);
      return data;
    })
    .catch((err) => {
      inFlightRequests.delete(key);
      throw err;
    });

  inFlightRequests.set(key, promise);
  return promise;
}
