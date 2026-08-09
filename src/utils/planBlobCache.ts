/**
 * Persistent blob cache for plan files (PDF/image), keyed by the plan's remote
 * URL. `planPdfCache` holds decoded pdf.js documents only for the session; this
 * stores the raw bytes in IndexedDB so a reload while offline can still render
 * the plan instead of failing on the network fetch.
 *
 * Keyed by URL (not plan_client_uuid) because the loader works from the URL and
 * a plan's URL is stable once uploaded; this keeps the cache a thin wrapper
 * around fetch with no extra plumbing through the call sites.
 */

const DB_NAME = 'reckon-plan-cache';
const STORE = 'plan-blobs';
const DB_VERSION = 1;

interface CachedBlob {
  url: string;
  blob: Blob;
  cachedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'url' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[planBlobCache] failed to open IndexedDB', req.error);
        resolve(null);
      };
    } catch (error) {
      console.warn('[planBlobCache] IndexedDB unavailable', error);
      resolve(null);
    }
  });
  return dbPromise;
};

const tx = async (
  mode: IDBTransactionMode
): Promise<IDBObjectStore | null> => {
  const db = await openDb();
  if (!db) return null;
  try {
    return db.transaction(STORE, mode).objectStore(STORE);
  } catch (error) {
    console.warn('[planBlobCache] transaction failed', error);
    return null;
  }
};

export const getCachedPlanBlob = async (url: string): Promise<Blob | null> => {
  const store = await tx('readonly');
  if (!store) return null;
  return new Promise((resolve) => {
    const req = store.get(url);
    req.onsuccess = () => resolve((req.result as CachedBlob | undefined)?.blob ?? null);
    req.onerror = () => resolve(null);
  });
};

export const putCachedPlanBlob = async (url: string, blob: Blob): Promise<void> => {
  const store = await tx('readwrite');
  if (!store) return;
  await new Promise<void>((resolve) => {
    const req = store.put({ url, blob, cachedAt: Date.now() } satisfies CachedBlob);
    req.onsuccess = () => resolve();
    req.onerror = () => {
      console.warn('[planBlobCache] failed to cache plan blob', req.error);
      resolve();
    };
  });
};

/**
 * Fetch a plan file's bytes, using the cache as an offline fallback:
 *   1. Try the network. On success, cache the bytes and return them.
 *   2. On network failure, return the cached bytes if present.
 * Throws only when both the network and the cache have nothing.
 */
export const fetchPlanBlobWithCache = async (url: string): Promise<Blob> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch plan file (${response.status})`);
    }
    const blob = await response.blob();
    // Cache in the background; a cache write must never block rendering.
    void putCachedPlanBlob(url, blob);
    return blob;
  } catch (networkError) {
    const cached = await getCachedPlanBlob(url);
    if (cached) return cached;
    throw networkError;
  }
};

export const clearPlanBlobCache = async (): Promise<void> => {
  const store = await tx('readwrite');
  if (!store) return;
  await new Promise<void>((resolve) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
};
