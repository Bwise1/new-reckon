export type TakeoffMode = "linear" | "area" | "count" | "polyline";

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
  /** When true, the markup is hidden from the canvas render. */
  hidden?: boolean;
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

export type UnitType = "m" | "m2" | "m3" | "nrs" | "item";

export interface HistoryItem {
  id: string;
  value: string;
  isDeduct?: boolean;
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

export interface BoqElementData {
  id: string;
  title: string;
  items: EstimationCardData[];
}

export interface BoqPricing {
  vatRate: number;
  contingency: number;
}
