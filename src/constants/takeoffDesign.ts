import type { TakeoffMode } from '@/types/takeoff';

/** Markup palette from product design */
export const MARKUP_COLORS = [
  '#E53935',
  '#26A69A',
  '#1E88E5',
  '#003566',
  '#8E24AA',
  '#FDD835',
  '#4FC3F7',
] as const;

export const MEASUREMENT_TOOLS: Array<{
  type: TakeoffMode;
  label: string;
  short: string;
}> = [
  { type: 'linear', label: 'Linear', short: 'L' },
  { type: 'area', label: 'Area', short: 'A' },
  { type: 'count', label: 'Count', short: 'C' },
];
