export type TakeoffMode = "linear" | "area" | "count" | "polyline";

/** Toolbar drawing modes. "arc" is input-only: the three clicks tessellate
 *  into an ordinary polyline measurement, so stored types stay TakeoffMode. */
export type DrawTool = TakeoffMode | "arc";

export interface Point {
  x: number;
  y: number;
}

export interface MeasurementMetadata {
  createdAt: string;
  lastModified: string;
  confidence?: number; // 0-1 score for measurement confidence
}

export interface Measurement {
  id: string;
  points: Point[];
  quantity: number;
  /** Plan/drawing this markup belongs to. */
  planId?: string;
  page: number;
  /** Geometry kind for this markup (linear, area, or count). */
  type?: TakeoffMode;
  /** Stroke/fill color for this markup. */
  color?: string;
  /** Line weight in canvas units (default 2). */
  strokeWidth?: number;
  /** When true, the markup is hidden from the canvas render. */
  hidden?: boolean;
  /** True for polylines tessellated from the arc tool. Carried in the sync
   *  metadata blob (no API column). Select mode shows only the endpoint
   *  handles for these — dragging interior vertices would break the curve. */
  arc?: boolean;
  /** User-given name for this measurement (e.g. "Kitchen floor"). When set,
   *  it's shown instead of the auto "Area N" label. */
  name?: string;
  /** Stable per-type sequence number assigned at creation and never reused,
   *  so the auto label ("Area 3") stays fixed even after deletions. */
  seq?: number;
  /** Bound BOQ Element id, if this measurement feeds a specific line item. */
  boqElementId?: string;
  /** Bound BOQ Item id (per-Element card). */
  boqItemId?: string;
  /** Deductions (cutouts) inside an area measurement. Each deduction is
   *  an inner polygon (≥3 points) whose area is subtracted from the outer
   *  polygon's area. Only meaningful when type === 'area'. */
  deductions?: Point[][];
  metadata?: MeasurementMetadata;
}

export type PlanDiscipline =
  | 'architectural'
  | 'structural'
  | 'mep'
  | 'civil'
  | 'other';

export interface ProjectPlan {
  id: string;
  name: string;
  /** Original uploaded filename (used to infer PDF vs image when mime is missing). */
  filename?: string;
  url?: string;
  mimeType?: string;
  pageCount: number;
  sortOrder: number;
  discipline?: PlanDiscipline;
}

export interface TakeoffItem {
  id: string;
  name: string;
  type: TakeoffMode;
  color: string;
  measurements: Measurement[];
  totalQuantity: number;
  unit: string;
}

export interface CalibrationLine {
  p1: Point;
  p2: Point;
  distance: number;
}

// The common presets kept as named suggestions, but units are free-text now
// (users can type custom ones like "kg", "tonns", "bags"), so UnitType is a
// string. The backend accepts any short non-empty unit label.
export type UnitPreset = "m" | "m2" | "m3" | "nrs" | "item" | "kg" | "tonns";
export type UnitType = string;

/** Preset unit options offered in the unit dropdown (user can also type). */
export const UNIT_PRESETS: { value: UnitPreset; label: string }[] = [
  { value: "m", label: "m" },
  { value: "m2", label: "m²" },
  { value: "m3", label: "m³" },
  { value: "nrs", label: "nrs" },
  { value: "item", label: "item" },
  { value: "kg", label: "kg" },
  { value: "tonns", label: "tonns" },
];

export interface HistoryItem {
  id: string;
  value: string;
  isDeduct?: boolean;
  /** When present, this entry mirrors a plan measurement. Manual edits to
   * the value strip this reference (unlink-on-edit). */
  sourceMeasurementId?: string;
  /** Entries sharing a groupId came from one continuous measuring session
   * (started when the user began measuring, ended by Exit/Escape) and are
   * displayed as a single summed chip instead of one per line. */
  groupId?: string;
}

export interface EstimationCardData {
  id: string;
  unit: UnitType;
  header: string;
  description: string;
  qty: string;
  rate: string;
  history: HistoryItem[];
}

/** A bill (sheet) in the BOQ: a named group of elements. Projects always
 *  have at least one; legacy projects load as a single default bill. */
export interface BoqBillData {
  id: string;
  name: string;
}

export interface BoqElementData {
  id: string;
  title: string;
  items: EstimationCardData[];
}

export interface BoqPricing {
  vatRate: number;
  contingency: number;
}
