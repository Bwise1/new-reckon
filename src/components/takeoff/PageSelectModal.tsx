import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from '@/utils/pdfjsLoader';

type Props = {
  /** The picked PDF file; the modal opens when this is non-null. */
  file: File | null;
  onCancel: () => void;
  /** Selected page numbers (1-based, ascending) and the document's page count. */
  onConfirm: (pages: number[], totalPages: number) => void;
};

const THUMB_W = 150; // px render width for previews
// How long a load may take before the "Reading document…" shell appears. A
// single-page PDF that opens faster than this auto-confirms with no UI at all.
const LOADING_SHELL_DELAY_MS = 350;

/**
 * PDF page picker (zzTakeoff-style): a lazy-thumbnail grid where the user
 * checks the pages to import. Only chosen pages are kept — the caller builds a
 * trimmed PDF from them, so unselected pages never reach the platform and never
 * count against storage. Thumbnails render on scroll to stay smooth for large
 * drawing sets. A single-page document needs no choice: it confirms itself
 * without rendering anything. pdf.js is loaded on demand (loadPdfjs) so the
 * canvas importing this modal statically does not pull it into the main chunk.
 */
export default function PageSelectModal({ file, onCancel, onConfirm }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showLoadingShell, setShowLoadingShell] = useState(false);
  // Latest confirm callback, read from the load effect without re-running it.
  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  // Load the PDF when a file arrives; reset selection each time.
  useEffect(() => {
    if (!file) {
      setPdf(null);
      setNumPages(0);
      setSelected(new Set());
      setLoadError(null);
      setShowLoadingShell(false);
      return;
    }
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    const shellTimer = window.setTimeout(() => setShowLoadingShell(true), LOADING_SHELL_DELAY_MS);
    (async () => {
      try {
        const pdfjsLib = await loadPdfjs();
        const buffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        if (doc.numPages <= 1) {
          // Nothing to choose — keep the only page and never show the picker.
          window.clearTimeout(shellTimer);
          void doc.destroy();
          onConfirmRef.current([1], doc.numPages);
          return;
        }
        loaded = doc;
        setPdf(doc);
        setNumPages(doc.numPages);
        // Default to all pages selected — the common case is "keep everything".
        setSelected(new Set(Array.from({ length: doc.numPages }, (_, i) => i + 1)));
      } catch {
        if (!cancelled) setLoadError('This PDF could not be opened. It may be corrupted or password-protected.');
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(shellTimer);
      if (loaded) void loaded.destroy();
    };
  }, [file]);

  const allPages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);
  const allSelected = numPages > 0 && selected.size === numPages;

  const toggle = (page: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === numPages ? new Set() : new Set(allPages)));

  if (!file) return null;
  // Still opening the document: render nothing until it has been slow enough
  // to deserve a shell, so single-page PDFs auto-confirm without a flash.
  if (!pdf && !loadError && !showLoadingShell) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 px-4 py-6"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select pages to import"
        className="flex max-h-full w-full max-w-3xl flex-col rounded-xl border border-border bg-surface text-body shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-body">Select pages to import</h2>
            <p className="mt-0.5 truncate text-xs text-muted">
              {file.name} · only the pages you keep count toward your storage.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-body"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadError ? (
          <div className="px-5 py-10 text-center text-sm text-danger">{loadError}</div>
        ) : !pdf ? (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
            Reading document…
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-body">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 rounded border-border accent-accent"
                />
                {allSelected ? 'Deselect all' : 'Select all'}
              </label>
              <span className="text-xs text-muted">
                {selected.size} of {numPages} page{numPages === 1 ? '' : 's'} selected
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {allPages.map((page) => (
                  <PageThumb
                    key={page}
                    pdf={pdf}
                    page={page}
                    checked={selected.has(page)}
                    onToggle={() => toggle(page)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-body"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => onConfirm([...selected].sort((a, b) => a - b), numPages)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Import {selected.size} page{selected.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One lazily-rendered page thumbnail with a selection checkbox. */
function PageThumb({
  pdf,
  page,
  checked,
  onToggle,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  checked: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  // Render only when scrolled into view.
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || rendered) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await pdf.getPage(page);
        const base = p.getViewport({ scale: 1 });
        const scale = THUMB_W / base.width;
        const viewport = p.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await p.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (!cancelled) setRendered(true);
      } catch {
        /* leave the placeholder if a page fails to render */
      }
    })();
    return () => { cancelled = true; };
  }, [visible, rendered, pdf, page]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`group relative flex flex-col items-center overflow-hidden rounded-lg border p-2 text-left transition-colors ${
        checked ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:bg-overlay/5'
      }`}
    >
      <span
        className={`absolute right-3 top-3 z-10 flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
          checked ? 'border-accent bg-accent text-primary-fg' : 'border-border bg-surface/80 text-transparent'
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded bg-surface-muted">
        <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
      </div>
      <span className="mt-1.5 text-[11px] font-medium text-muted">Page {page}</span>
    </button>
  );
}
