import React, { useRef, useState } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { parseBoqWorkbook, type BoqImportResult } from '@/utils/boqImport';
import { useTakeoffStore } from '@/store/useTakeoffStore';

interface BoqImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Called once bills have been added; the count is what was imported. */
  onImported?: (billCount: number) => void;
}

type Mode = 'append' | 'replace';

/**
 * Import a BOQ from a spreadsheet: pick a file, see what was found on each
 * sheet, choose whether it adds to or replaces the project's bills, confirm.
 *
 * Nothing is written until the person confirms, and the parse runs entirely
 * in the browser — the file never leaves the machine. Sheets a person
 * unticks are simply not imported.
 */
const BoqImportModal: React.FC<BoqImportModalProps> = ({ open, onClose, onImported }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<BoqImportResult | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('append');
  const [error, setError] = useState<string | null>(null);

  const bills = useTakeoffStore((s) => s.bills);
  const importBills = useTakeoffStore((s) => s.importBills);
  const existingCount = bills.length;

  if (!open) return null;

  const reset = () => {
    setFileName(null);
    setResult(null);
    setExcluded(new Set());
    setMode('append');
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setExcluded(new Set());
    setError(null);
    setParsing(true);
    try {
      const parsed = await parseBoqWorkbook(await file.arrayBuffer());
      if (parsed.bills.length === 0) {
        setError(
          parsed.skipped.length > 0
            ? `Nothing to import — ${parsed.skipped.map((s) => `${s.sheetName}: ${s.reason.toLowerCase()}`).join('; ')}.`
            : 'That file has no sheets.'
        );
      }
      setResult(parsed);
    } catch (e) {
      setError((e as Error).message || 'Could not read that file.');
    } finally {
      setParsing(false);
    }
  };

  const selected = result?.bills.filter((b) => !excluded.has(b.sheetName)) ?? [];
  const totals = selected.reduce(
    (acc, b) => ({ elements: acc.elements + b.elementCount, items: acc.items + b.itemCount }),
    { elements: 0, items: 0 }
  );

  const toggle = (sheetName: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(sheetName)) next.delete(sheetName);
      else next.add(sheetName);
      return next;
    });
  };

  const confirm = () => {
    if (selected.length === 0) return;
    importBills(
      selected.map((b) => ({ name: b.sheetName, elements: b.elements })),
      mode
    );
    onImported?.(selected.length);
    close();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-scrim/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface shadow-xl p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-body">Import BOQ from Excel</h3>
            <p className="mt-0.5 text-xs text-muted">
              Each sheet becomes a bill. Files exported from Reckon import exactly; other layouts are read by their column names.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-overlay/10 hover:text-body transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          onChange={(e) => void pick(e)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={parsing}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 text-left transition-colors hover:border-accent/60 hover:bg-overlay/5 disabled:opacity-60 cursor-pointer"
        >
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted" strokeWidth={1.5} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-body">
              {parsing ? 'Reading…' : fileName ?? 'Choose a spreadsheet'}
            </span>
            <span className="block text-[11px] text-muted">.xlsx, .xls or .csv</span>
          </span>
        </button>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}

        {result && result.bills.length > 0 && (
          <div className="mt-4 space-y-4">
            <ul className="divide-y divide-border rounded-lg border border-border">
              {result.bills.map((bill) => {
                const on = !excluded.has(bill.sheetName);
                return (
                  <li key={bill.sheetName} className="px-3 py-2.5">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(bill.sheetName)}
                        className="mt-1 cursor-pointer"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-body">{bill.sheetName}</span>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              bill.layout === 'reckon'
                                ? 'bg-accent/10 text-accent'
                                : 'bg-warn/10 text-warn'
                            }`}
                          >
                            {bill.layout === 'reckon' ? 'Reckon export' : 'By columns'}
                          </span>
                        </span>
                        <span className="block text-[11px] text-muted">
                          {bill.elementCount} element{bill.elementCount === 1 ? '' : 's'} · {bill.itemCount} item{bill.itemCount === 1 ? '' : 's'}
                        </span>
                        {bill.warnings.map((w) => (
                          <span key={w} className="mt-1 block text-[11px] text-warn">
                            {w}
                          </span>
                        ))}
                      </span>
                    </label>
                  </li>
                );
              })}
              {result.skipped.map((s) => (
                <li key={`skip-${s.sheetName}`} className="px-3 py-2 text-[11px] text-muted">
                  <span className="font-medium">{s.sheetName}</span> — skipped: {s.reason.toLowerCase()}
                </li>
              ))}
            </ul>

            <div>
              <p className="mb-1.5 text-sm font-semibold text-body">Existing bills</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('append')}
                  className={`flex-1 rounded-lg border py-2 text-sm font-semibold transition ${
                    mode === 'append'
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-border text-muted hover:border-muted/60'
                  }`}
                >
                  Keep and add
                </button>
                <button
                  type="button"
                  onClick={() => setMode('replace')}
                  className={`flex-1 rounded-lg border py-2 text-sm font-semibold transition ${
                    mode === 'replace'
                      ? 'border-danger bg-danger text-white'
                      : 'border-border text-muted hover:border-muted/60'
                  }`}
                >
                  Replace all
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                {mode === 'replace'
                  ? `Removes ${existingCount} existing bill${existingCount === 1 ? '' : 's'} before importing. You can undo.`
                  : 'New bills are added after the ones already here. A blank project is filled in place.'}
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted hover:text-body transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={selected.length === 0 || parsing}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-fg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {selected.length === 0
              ? 'Import'
              : `Import ${selected.length} bill${selected.length === 1 ? '' : 's'} · ${totals.items} item${totals.items === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BoqImportModal;
