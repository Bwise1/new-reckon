/**
 * Calibration entry units. The app stores everything in metres internally
 * (scale is pixels-per-metre, measurements are m/m²/m³), so the unit selector
 * is a convenience for entry only — the typed value is converted to metres
 * before a scale is computed. Matches the YemiKrist prototype's unit list.
 */
export const CALIBRATION_UNITS = ['m', 'cm', 'mm', 'ft', 'in'] as const;
export type CalibrationUnit = (typeof CALIBRATION_UNITS)[number];

const METRES_PER: Record<CalibrationUnit, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  ft: 0.3048,
  in: 0.0254,
};

/** Convert a value in the given unit to metres. */
export function toMetres(value: number, unit: CalibrationUnit): number {
  return value * METRES_PER[unit];
}
