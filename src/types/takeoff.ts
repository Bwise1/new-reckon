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
  page: number;
  metadata?: MeasurementMetadata;
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
