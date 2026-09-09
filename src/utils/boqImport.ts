import type { BoqElementData, EstimationCardData, HistoryItem } from '@/types/takeoff';
import { generateClientId } from '@/utils/id';
import { elementTitleFromIndex } from '@/utils/boqCalculations';

/**
 * Read a spreadsheet into bills → elements → items.
 *
 * Two layouts are understood:
 *
 *  - "reckon": what our own Excel export writes (reckon_api excelHelper.js).
 *    One sheet per bill; six columns ITEM / DESCRIPTION / QTY / UNIT / RATE /
 *    AMOUNT; an element is a text-only row in column B that opens a section,
 *    closed by its "… TO SUMMARY" subtotal row; text-only rows inside a
 *    section are item-group headers. The QTY cell holds the measurement
 *    history as a formula — `=(12.5)+(3.2)-(1.1)` — so it round-trips.
 *
 *  - "generic": any sheet with a header row naming a description and a
 *    quantity column. Rows with a quantity are items; text-only rows are
 *    elements (or, when they directly follow another text-only row, group
 *    headers). Best effort — the preview says so, and the person can check.
 *
 * Everything produced carries fresh client ids, ready for the store and the
 * per-entity sync. Quantities import as typed values: the file has no link to
 * plan geometry, so history entries come back as manual crumbs.
 *
 * The parser depends on SheetJS, loaded on first use so the main bundle does
 * not carry it.
 */

export type ImportLayout = 'reckon' | 'generic';

export interface ImportedBill {
  /** Sheet tab, used as the bill name. */
  sheetName: string;
  layout: ImportLayout;
  elements: BoqElementData[];
  elementCount: number;
  itemCount: number;
  warnings: string[];
}

export interface SkippedSheet {
  sheetName: string;
  reason: string;
}

export interface BoqImportResult {
  bills: ImportedBill[];
  skipped: SkippedSheet[];
}

type Cell = { v: unknown; f?: string };
type Row = Cell[];

const text = (cell: Cell | undefined): string =>
  cell && cell.v !== null && cell.v !== undefined ? String(cell.v).trim() : '';

const isBlank = (cell: Cell | undefined): boolean => text(cell) === '';

const numberOf = (cell: Cell | undefined): number | null => {
  if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return null;
  if (typeof cell.v === 'number') return Number.isFinite(cell.v) ? cell.v : null;
  const parsed = Number.parseFloat(String(cell.v).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

/** "SUBSTRUCTURE" → "Substructure"; mixed-case text is left alone. */
const unshout = (value: string): string => {
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2 || letters !== letters.toUpperCase()) return value;
  return value.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
};

/**
 * Spelling seen on real BOQs → the unit keys the app uses. Anything else is
 * kept as typed — units are free text on the platform.
 */
const UNIT_ALIASES: Record<string, string> = {
  m: 'm', lm: 'm', 'lin.m': 'm', 'lin m': 'm', metre: 'm', meter: 'm', metres: 'm', meters: 'm',
  'm²': 'm2', m2: 'm2', sqm: 'm2', 'sq.m': 'm2', 'sq m': 'm2', 'sq.m.': 'm2',
  'm³': 'm3', m3: 'm3', cum: 'm3', 'cu.m': 'm3', 'cu m': 'm3', 'cu.m.': 'm3',
  nr: 'nrs', nrs: 'nrs', no: 'nrs', 'no.': 'nrs', nos: 'nrs', 'nos.': 'nrs', number: 'nrs', numbers: 'nrs', each: 'nrs', ea: 'nrs',
  item: 'item', itm: 'item', items: 'item', sum: 'item', ls: 'item', 'l.s.': 'item',
  kg: 'kg', kgs: 'kg',
  ton: 'tonns', tons: 'tonns', tonne: 'tonns', tonnes: 'tonns', tonn: 'tonns', tonns: 'tonns', t: 'tonns',
};

export const normalizeUnit = (raw: string): string => {
  const key = raw.trim().toLowerCase();
  if (!key) return 'item';
  return UNIT_ALIASES[key] ?? raw.trim();
};

/** Same rule the exporter applies before writing a history term. */
const SAFE_EXPRESSION = /^[0-9+\-*/().\s]+$/;

/**
 * `=(12.5)+(3.2)-(1.1)` → three history entries, the last a deduction. A
 * formula that is not one of ours (a bare `=C7*2`, a SUM) yields nothing and
 * the caller falls back to the cell's cached value.
 */
export const historyFromFormula = (formula: string): HistoryItem[] => {
  const src = formula.replace(/^=/, '').replace(/\s+/g, '');
  const groups = [...src.matchAll(/([+-]?)\(([^()]*)\)/g)];
  if (groups.length === 0) return [];
  // The groups must account for the whole formula, or it is not ours.
  const rebuilt = groups.map((g) => `${g[1]}(${g[2]})`).join('');
  if (rebuilt !== src) return [];
  const entries: HistoryItem[] = [];
  for (const g of groups) {
    const expr = g[2].trim();
    if (!SAFE_EXPRESSION.test(expr)) return [];
    entries.push({ id: generateClientId(), value: expr, isDeduct: g[1] === '-' });
  }
  return entries;
};

const formatQty = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));

const makeItem = (fields: {
  header: string;
  description: string;
  qtyCell: Cell | undefined;
  unit: string;
  rate: number | null;
}): EstimationCardData => {
  let history = fields.qtyCell?.f ? historyFromFormula(fields.qtyCell.f) : [];
  const qty = numberOf(fields.qtyCell) ?? 0;
  // A card's quantity is the sum of its history, so a plain number becomes
  // one manual crumb — the same thing typing it into the card would do.
  if (history.length === 0 && qty !== 0) {
    history = [{ id: generateClientId(), value: formatQty(Math.abs(qty)), isDeduct: qty < 0 }];
  }
  return {
    id: generateClientId(),
    unit: normalizeUnit(fields.unit),
    header: fields.header,
    description: fields.description,
    qty: formatQty(qty),
    rate: fields.rate === null ? '0' : formatQty(fields.rate),
    history,
  };
};

const makeElement = (title: string, index: number): BoqElementData => ({
  id: generateClientId(),
  title: title.trim() || elementTitleFromIndex(index),
  items: [],
});

// ─── Our own export ──────────────────────────────────────────────────────────

const isReckonHeaderRow = (row: Row): boolean =>
  text(row[1]).toUpperCase() === 'DESCRIPTION' && text(row[2]).toUpperCase() === 'QTY';

const parseReckonSheet = (rows: Row[], headerIndex: number): BoqElementData[] => {
  const elements: BoqElementData[] = [];
  let current: BoqElementData | null = null;
  let group = '';
  // The first text-only row after the header (or a subtotal) opens an element;
  // later text-only rows inside the section are item-group headers.
  let expectElement = true;

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const label = text(row[1]);
    const hasQty = !isBlank(row[2]);
    const hasUnit = !isBlank(row[3]);
    const hasRate = !isBlank(row[4]);
    const hasAmount = !isBlank(row[5]);

    if (!label && !hasQty && !hasUnit && !hasRate) continue; // blank spacer
    // The export repeats the column headers above every element.
    if (isReckonHeaderRow(row)) continue;

    if (label && !hasQty && !hasUnit && !hasRate) {
      const upper = label.toUpperCase();
      if (upper.endsWith('TO SUMMARY')) {
        // Closes the section.
        current = null;
        group = '';
        expectElement = true;
        continue;
      }
      if (hasAmount) continue; // summary / sub-total / VAT / total rows
      if (upper === 'SUMMARY' || upper === 'GENERAL SUMMARY') {
        current = null;
        expectElement = true;
        continue;
      }
      if (expectElement || !current) {
        current = makeElement(unshout(label), elements.length);
        elements.push(current);
        group = '';
        expectElement = false;
      } else {
        group = label;
      }
      continue;
    }

    if (!label) continue; // a number with no description is not an item
    if (!current) {
      current = makeElement('', elements.length);
      elements.push(current);
      expectElement = false;
    }
    current.items.push(
      makeItem({
        header: group,
        description: label,
        qtyCell: row[2],
        unit: text(row[3]),
        rate: numberOf(row[4]),
      })
    );
  }
  return elements.filter((el) => el.items.length > 0 || el.title);
};

// ─── Anyone else's spreadsheet ──────────────────────────────────────────────

interface ColumnMap {
  description: number;
  qty: number;
  unit: number | null;
  rate: number | null;
  amount: number | null;
}

const findGenericHeader = (rows: Row[]): { index: number; map: ColumnMap } | null => {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? [];
    let description = -1;
    let qty = -1;
    let unit: number | null = null;
    let rate: number | null = null;
    let amount: number | null = null;
    row.forEach((cell, c) => {
      const h = text(cell).toLowerCase();
      if (!h) return;
      // Headers often carry a currency or a note in brackets: "Unit Rate (NGN)".
      const base = h.replace(/\s*\(.*\)\s*$/, '').trim();
      if (description === -1 && /^(description|item description|particulars|work item|works?|description of works?)$/.test(base)) description = c;
      else if (qty === -1 && /^(qty|qty\.|quantity|quantities)$/.test(base)) qty = c;
      else if (unit === null && /^(unit|units|uom)$/.test(base)) unit = c;
      else if (rate === null && /^(rate|unit rate|unit price|price|rate per unit)$/.test(base)) rate = c;
      else if (amount === null && /^(amount|total|value|total amount)$/.test(base)) amount = c;
    });
    if (description !== -1 && qty !== -1) {
      return { index: i, map: { description, qty, unit, rate, amount } };
    }
  }
  return null;
};

const parseGenericSheet = (rows: Row[], headerIndex: number, map: ColumnMap): BoqElementData[] => {
  const elements: BoqElementData[] = [];
  let current: BoqElementData | null = null;
  let group = '';

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const label = text(row[map.description]);
    const qtyCell = row[map.qty];
    const hasQty = numberOf(qtyCell) !== null;
    const hasRate = map.rate !== null && numberOf(row[map.rate]) !== null;
    const hasAmount = map.amount !== null && numberOf(row[map.amount]) !== null;

    if (!label) continue;
    // A repeated header row (some sheets restate it per section).
    if (/^(description|item description|particulars)$/i.test(label) && /^(qty|quantity)$/i.test(text(qtyCell))) continue;
    if (!hasQty && !hasRate) {
      if (hasAmount) continue; // a subtotal / total line
      const upper = label.toUpperCase();
      if (/^(sub[- ]?total|total|summary|general summary|carried forward|brought forward)/.test(upper)) continue;
      // Sections on a QS's sheet are conventionally set in capitals and the
      // trade headings beneath them in mixed case, so: capitals open an
      // element; mixed case is an item group inside the current one (or an
      // element when there is none yet).
      const letters = label.replace(/[^A-Za-z]/g, '');
      const shouted = letters.length >= 2 && letters === letters.toUpperCase();
      if (!shouted && current) {
        group = label;
      } else {
        current = makeElement(unshout(label), elements.length);
        elements.push(current);
        group = '';
      }
      continue;
    }
    if (!current) {
      current = makeElement('', elements.length);
      elements.push(current);
    }
    current.items.push(
      makeItem({
        header: group,
        description: label,
        qtyCell,
        unit: map.unit === null ? '' : text(row[map.unit]),
        rate: map.rate === null ? null : numberOf(row[map.rate]),
      })
    );
  }
  return elements.filter((el) => el.items.length > 0);
};

// ─── Workbook ────────────────────────────────────────────────────────────────

type SheetJS = typeof import('xlsx');

const gridOf = (XLSX: SheetJS, ws: import('xlsx').WorkSheet): Row[] => {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: Row[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: Row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as { v?: unknown; f?: string } | undefined;
      row[c] = cell ? { v: cell.v, f: cell.f } : { v: null };
    }
    rows[r] = row;
  }
  return rows;
};

export const parseBoqWorkbook = async (data: ArrayBuffer): Promise<BoqImportResult> => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(data, { type: 'array', cellFormula: true, cellNF: false });
  const bills: ImportedBill[] = [];
  const skipped: SkippedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    if (/^(summary|general summary)$/i.test(sheetName.trim())) {
      skipped.push({ sheetName, reason: 'Summary sheet' });
      continue;
    }
    const rows = gridOf(XLSX, ws);
    const warnings: string[] = [];
    let layout: ImportLayout = 'reckon';
    let elements: BoqElementData[] = [];

    const reckonHeader = rows.findIndex((row) => row && isReckonHeaderRow(row));
    if (reckonHeader !== -1) {
      elements = parseReckonSheet(rows, reckonHeader);
    } else {
      const generic = findGenericHeader(rows);
      if (!generic) {
        skipped.push({ sheetName, reason: 'No description and quantity columns found' });
        continue;
      }
      layout = 'generic';
      elements = parseGenericSheet(rows, generic.index, generic.map);
      warnings.push('Layout read from column names: rows in CAPITALS became elements, other headings item groups — check the grouping.');
      if (generic.map.unit === null) warnings.push('No unit column; items default to "item".');
      if (generic.map.rate === null) warnings.push('No rate column; rates are 0.');
    }

    const itemCount = elements.reduce((n, el) => n + el.items.length, 0);
    if (itemCount === 0) {
      skipped.push({ sheetName, reason: 'No items on this sheet' });
      continue;
    }
    bills.push({
      sheetName: sheetName.trim() || `Bill ${bills.length + 1}`,
      layout,
      elements,
      elementCount: elements.length,
      itemCount,
      warnings,
    });
  }
  return { bills, skipped };
};

/** True when any item holds something a person typed or measured. */
export const elementsHaveContent = (elements: BoqElementData[]): boolean =>
  elements.some((el) =>
    el.items.some(
      (item) =>
        Boolean(item.header?.trim()) ||
        Boolean(item.description?.trim()) ||
        item.history.length > 0 ||
        Number.parseFloat(item.qty.replace(/,/g, '')) > 0 ||
        Number.parseFloat(item.rate.replace(/,/g, '')) > 0
    )
  );
