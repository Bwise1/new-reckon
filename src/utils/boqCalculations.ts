import type { BoqElementData, EstimationCardData, HistoryItem } from '@/types/takeoff';
import { generateClientId } from '@/utils/id';
import { calculateExpressionMobileCompat } from '@/utils/mobileCalculationEngine';

export const computeQtyFromHistory = (history: HistoryItem[]): number => {
  return history.reduce((total, entry) => {
    try {
      const value = calculateExpressionMobileCompat(entry.value);
      if (!Number.isFinite(value)) return total;
      return entry.isDeduct ? total - value : total + value;
    } catch {
      return total;
    }
  }, 0);
};

export const formatQtyDisplay = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return `${value}`;
  return value.toFixed(2).replace(/\.?0+$/, '');
};

export const parseRateNumber = (value: string): number => {
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
};

/** Currency display: 0,000.00 */
export const formatRateDisplay = (value: string | number): string => {
  const num = typeof value === 'number' ? value : parseRateNumber(value);
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/** Raw string for editing (no commas); empty when zero */
export const rateToEditString = (value: string): string => {
  const num = parseRateNumber(value);
  if (num === 0) return '';
  return String(num);
};

export const sanitizeRateInput = (value: string): string => {
  const cleaned = value.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
};

const ELEMENT_WORDS = [
  'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
];

export const elementTitleFromIndex = (index: number): string =>
  `Element ${ELEMENT_WORDS[index] ?? String(index + 1)}`;

/**
 * True when a title is still an app-generated "Element N" — i.e. the user has
 * never renamed it. Deliberately inferred from the string rather than stored
 * as a flag: the auto titles are a closed, known set, so this needs no schema
 * change and works for elements created before renumbering existed.
 *
 * Matching is case-insensitive and ignores surrounding space because the
 * rename input sentence-cases what it stores.
 */
export const isAutoElementTitle = (title: string): boolean => {
  const t = (title ?? '').trim().toLowerCase();
  if (!t) return true; // blank is treated as auto so it picks up a number
  if (ELEMENT_WORDS.some((w) => t === `element ${w.toLowerCase()}`)) return true;
  // Beyond the words list the generator falls back to digits ("Element 11").
  return /^element \d+$/.test(t);
};

/**
 * Renumber auto-titled elements to match their POSITION, leaving user-named
 * ones untouched. Positional (not sequential-among-auto) is deliberate: the
 * number tells you where a section sits in the bill, so with a custom name in
 * the middle you get One, DPM Works, Three — position three really is third.
 *
 * Returns the same array reference when nothing changed, so callers can skip
 * pointless state updates and sync ops.
 */
export const renumberAutoElements = <T extends { title: string }>(
  elements: T[]
): T[] => {
  let changed = false;
  const next = elements.map((el, index) => {
    if (!isAutoElementTitle(el.title)) return el;
    const title = elementTitleFromIndex(index);
    if (el.title === title) return el;
    changed = true;
    return { ...el, title };
  });
  return changed ? next : elements;
};

export const createEmptyBoqItem = (): EstimationCardData => ({
  id: generateClientId(),
  unit: 'm3',
  header: '',
  description: '',
  qty: '0',
  rate: '0',
  history: [],
});

export const createEmptyBoqElement = (index: number): BoqElementData => {
  const item = createEmptyBoqItem();
  return {
    id: generateClientId(),
    title: elementTitleFromIndex(index),
    items: [item],
  };
};

// Construction/survey convention: I and O are skipped when lettering items
// so they can't be mistaken for 1 and 0. 24 usable letters per "digit".
const LABEL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const itemLabelFromIndex = (index: number): string => {
  const base = LABEL_ALPHABET.length;
  let label = '';
  let n = index;
  do {
    label = LABEL_ALPHABET[n % base] + label;
    n = Math.floor(n / base) - 1;
  } while (n >= 0);
  return label;
};
