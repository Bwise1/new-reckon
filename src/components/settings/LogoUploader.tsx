import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Image as ImageIcon, RefreshCw, Trash2, UploadCloud } from 'lucide-react';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 512;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Downscale raster logos so they stay small; pass SVG through untouched. */
async function normalize(file: File): Promise<string> {
  if (file.type === 'image/svg+xml') return readAsDataUrl(file);
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no-2d-context');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL('image/png');
  } catch {
    return readAsDataUrl(file);
  }
}

type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
};

/** Logo picker with drag-and-drop + downscale. Ported from the prototype. */
export default function LogoUploader({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      if (!file.type.startsWith('image/')) {
        setError('That file is not an image.');
        return;
      }
      if (file.size > MAX_BYTES) {
        setError('Keep the logo under 2 MB.');
        return;
      }
      setBusy(true);
      try {
        onChange(await normalize(file));
      } catch {
        setError('Could not read that image. Try a different file.');
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-muted">
          {value ? (
            <img src={value} alt="Workspace logo preview" className="h-full w-full object-contain" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted" />
          )}
        </div>

        <div
          onDragOver={(e: DragEvent) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setDragging(false);
            void accept(e.dataTransfer.files?.[0]);
          }}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
            dragging ? 'border-overlay/40 bg-overlay/5' : 'border-border bg-surface'
          }`}
        >
          <UploadCloud className="h-5 w-5 text-muted" />
          <p className="mt-1.5 text-xs text-muted">
            Drag an image here, or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="font-semibold text-body underline hover:no-underline"
            >
              browse files
            </button>
          </p>
          {busy ? <p className="mt-1 text-[11px] text-muted">Processing image…</p> : null}
        </div>
      </div>

      {value ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-body transition-colors hover:bg-overlay/5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Replace
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void accept(file);
        }}
      />
    </div>
  );
}
