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

export const itemLabelFromIndex = (index: number): string => {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
};
