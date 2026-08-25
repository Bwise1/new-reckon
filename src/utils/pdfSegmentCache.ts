/**
 * Persistent cache of extracted PDF vector segments, keyed by plan + page.
 * Extraction walks the full operator list — cheap for most plans, seconds for
 * heavy CAD exports — and its input never changes for an uploaded plan, so the
 * result is cached in IndexedDB and re-opens are instant.
 *
 * Segments are stored in PDF user space (scale = 1, unrotated), exactly what
 * extractPdfSegments returns; consumers apply their own space conversion.
 */

import type { PdfSegment } from '@/utils/pdfLineExtractor';

const DB_NAME = 'reckon-pdf-segments';
const STORE = 'segments';
const DB_VERSION = 1;

interface CachedSegments {
  key: string;
  /** Flat [x1,y1,x2,y2, ...] — compact and structured-clone friendly. */
  flat: Float64Array;
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
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[pdfSegmentCache] failed to open IndexedDB', req.error);
        resolve(null);
      };
    } catch (error) {
      console.warn('[pdfSegmentCache] IndexedDB unavailable', error);
      resolve(null);
    }
  });
  return dbPromise;
};

export const segmentCacheKey = (planId: string, page: number): string =>
  `${planId}:${page}`;

export const getCachedSegments = async (
  key: string
): Promise<PdfSegment[] | null> => {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as CachedSegments | undefined;
        if (!row || !row.flat || row.flat.length % 4 !== 0) {
          resolve(null);
          return;
        }
        const segments: PdfSegment[] = [];
        const flat = row.flat;
        for (let i = 0; i < flat.length; i += 4) {
          segments.push({ x1: flat[i], y1: flat[i + 1], x2: flat[i + 2], y2: flat[i + 3] });
        }
        resolve(segments);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

export const setCachedSegments = async (
  key: string,
  segments: PdfSegment[]
): Promise<void> => {
  const db = await openDb();
  if (!db) return;
  const flat = new Float64Array(segments.length * 4);
  segments.forEach((seg, i) => {
    flat[i * 4] = seg.x1;
    flat[i * 4 + 1] = seg.y1;
    flat[i * 4 + 2] = seg.x2;
    flat[i * 4 + 3] = seg.y2;
  });
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, flat, cachedAt: Date.now() } satisfies CachedSegments);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
};
