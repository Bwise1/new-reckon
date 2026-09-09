import React, { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  mergeImportedBills,
  parseBoqWorkbook,
  withFreshIds,
  type BoqImportResult,
} from '@/utils/boqImport';
import { useTakeoffStore } from '@/store/useTakeoffStore';

interface BoqImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Called once bills have been added or updated. */
  onImported?: (billCount: number) => void;
}

type Mode = 'update' | 'append' | 'replace';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Import a BOQ from a spreadsheet: pick a file, see what was found on each
 * sheet, choose what to do with the project's existing bills, confirm.
 *
 * A file exported from THIS project (our export writes hidden ids) can also
 * be applied as an update: rows update the entities they came from, new
 * rows are added, and rows the file no longer has can be removed. A file
 * from another project, or anyone else's spreadsheet, can only be added or
 * used to replace everything.
 *
 * Nothing is written until the person confirms, and the parse runs entirely
 * in the browser — the file never leaves the machine.
 */
const BoqImportModal: React.FC<BoqImportModalProps> = ({ open, onClose, onImported }) => {
  const { id: routeProjectId } = useParams<{ id: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<BoqImportResult | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('append');
  const [deleteMissing, setDeleteMissing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bills = useTakeoffStore((s) => s.bills);
  const collectBills = useTakeoffStore((s) => s.collectBills);
  const importBills = useTakeoffStore((s) => s.importBills);
  const applyImportUpdate = useTakeoffStore((s) => s.applyImportUpdate);
  const existingCount = bills.length;

  const selected = useMemo(
    () => result?.bills.filter((b) => !excluded.has(b.sheetName)) ?? [],
    [result, excluded]
  );

  // Update is on offer when the file came from this very project and its
  // rows still carry their ids (someone may have deleted the hidden column).
  const fromThisProject =
    Boolean(result?.source) && String(result?.source?.projectId) === String(routeProjectId ?? '');
  const canUpdate = fromThisProject && selected.some((b) => b.hasIds && b.billId);
  const fromOtherProject = Boolean(result?.source) && !fromThisProject;

  const preview = useMemo(() => {
    if (!canUpdate || mode !== 'update') return null;
    return mergeImportedBills(collectBills(), selected, { deleteMissing });
  }, [canUpdate, mode, collectBills, selected, deleteMissing]);

  if (!open) return null;

  const reset = () => {
    setFileName(null);
    setResult(null);
    setExcluded(new Set());
    setMode('append');
    setDeleteMissing(true);
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
      const ours =
        Boolean(parsed.source) &&
        String(parsed.source?.projectId) === String(routeProjectId ?? '') &&
        parsed.bills.some((b) => b.hasIds && b.billId);
      setMode(ours ? 'update' : 'append');
    } catch (e) {
      setError((e as Error).message || 'Could not read that file.');
    } finally {
      setParsing(false);
    }
  };

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
    if (mode === 'update' && preview) {
      applyImportUpdate(preview.bills);
    } else {
      importBills(
        selected.map((b) => ({ name: b.sheetName, elements: withFreshIds(b.elements) })),
        mode === 'replace' ? 'replace' : 'append'
      );
    }
    onImported?.(selected.length);
    close();
  };

  const stats = preview?.stats;
  const confirmLabel =
    selected.length === 0
      ? 'Import'
      : mode === 'update' && stats
        ? `Update · ${plural(stats.changedItems, 'change')} · ${stats.newItems} new · ${stats.removedItems} removed`
        : `Import ${plural(selected.length, 'bill')} · ${plural(totals.items, 'item')}`;

  const modeButton = (value: Mode, label: string, danger = false) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`flex-1 rounded-lg border py-2 text-sm font-semibold transition ${
        mode === value
          ? danger
            ? 'border-danger bg-danger text-white'
            : 'border-accent bg-accent text-accent-fg'
          : 'border-border text-muted hover:border-muted/60'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-scrim/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface shadow-xl p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-body">Import BOQ from Excel</h3>
            <p className="mt-0.5 text-xs text-muted">
              Each sheet becomes a bill. A file exported from this project can be applied as an update; other layouts are read by their column names.
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
                          {plural(bill.elementCount, 'element')} · {plural(bill.itemCount, 'item')}
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

            {fromOtherProject && (
              <p className="text-[11px] text-muted">
                This file was exported from a different project, so it can only be added here as new bills.
              </p>
            )}

            <div>
              <p className="mb-1.5 text-sm font-semibold text-body">
                {canUpdate ? 'What to do' : 'Existing bills'}
              </p>
              <div className="flex gap-2">
                {canUpdate && modeButton('update', 'Update this project')}
                {modeButton('append', canUpdate ? 'Add as new' : 'Keep and add')}
                {modeButton('replace', 'Replace all', true)}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                {mode === 'update'
                  ? 'Rows update the items they were exported from; new rows are added. You can undo.'
                  : mode === 'replace'
                    ? `Removes ${plural(existingCount, 'existing bill')} before importing. You can undo.`
                    : 'New bills are added after the ones already here. A blank project is filled in place.'}
              </p>
            </div>

            {mode === 'update' && stats && (
              <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-[12px] text-muted space-y-1.5">
                <p className="text-body">
                  {plural(stats.changedItems, 'item')} changed · {stats.newItems} new
                  {stats.newElements > 0 ? ` (${plural(stats.newElements, 'new element')})` : ''}
                  {stats.renamedBills > 0 ? ` · ${plural(stats.renamedBills, 'bill')} renamed` : ''}
                  {stats.newBills > 0 ? ` · ${plural(stats.newBills, 'new bill')}` : ''}
                </p>
                {stats.quantityEdited > 0 && (
                  <p className="text-warn">
                    Quantity edited in Excel for {plural(stats.quantityEdited, 'item')} — their measurement links will be removed.
                  </p>
                )}
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={deleteMissing}
                    onChange={(e) => setDeleteMissing(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <span>
                    Also remove what the file no longer has
                    {deleteMissing
                      ? ` (${plural(stats.removedItems, 'item')}${stats.removedElements > 0 ? `, ${plural(stats.removedElements, 'element')}` : ''})`
                      : ''}
                  </span>
                </label>
              </div>
            )}
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BoqImportModal;
