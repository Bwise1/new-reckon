import type * as pdfjsLib from 'pdfjs-dist';

/**
 * Lazy, shared pdf.js loader. pdf.js is ~1 MB and only needed once a plan is
 * actually opened, so nothing imports it statically — every consumer awaits
 * this instead, which keeps it out of the main chunk. The worker is bundled
 * locally (Vite emits it into the build) rather than loaded from a CDN, so the
 * canvas works fully offline and in the packaged desktop (Tauri) app, which
 * has no guaranteed network. GlobalWorkerOptions is wired exactly once, the
 * first time the library is loaded.
 */
let pdfjsPromise: Promise<typeof pdfjsLib> | null = null;

export function loadPdfjs(): Promise<typeof pdfjsLib> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
    // Let a transient failure (offline chunk fetch) be retried next time.
    pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}
