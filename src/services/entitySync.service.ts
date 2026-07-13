import { apiClient } from '@/lib/api-client';

// ---------- Calibrations ----------

export interface ApiCalibration {
  project_id: number;
  plan_client_uuid: string;
  page: number;
  scale_pixels_per_meter: number;
  p1_x: number;
  p1_y: number;
  p2_x: number;
  p2_y: number;
  distance_meters: number;
  created_at?: string;
  updated_at?: string;
}

export interface CalibrationUpsertBody {
  scale_pixels_per_meter: number;
  p1_x: number;
  p1_y: number;
  p2_x: number;
  p2_y: number;
  distance_meters: number;
}

export const calibrationSync = {
  list: (projectId: string) =>
    apiClient.get<{ data: { calibrations: ApiCalibration[] } }>(
      `/projects/${projectId}/calibrations`
    ),
  upsert: (
    projectId: string,
    planUuid: string,
    page: number,
    body: CalibrationUpsertBody
  ) =>
    apiClient.put<{ data: { calibration: ApiCalibration } }>(
      `/projects/${projectId}/calibrations/${planUuid}/${page}`,
      body
    ),
  delete: (projectId: string, planUuid: string, page: number) =>
    apiClient.delete<{ data?: unknown }>(
      `/projects/${projectId}/calibrations/${planUuid}/${page}`
    ),
};

// ---------- Measurements ----------

export interface ApiMeasurement {
  client_uuid: string;
  project_id: number;
  plan_client_uuid: string;
  takeoff_item_client_uuid: string;
  page: number;
  type: 'linear' | 'polyline' | 'area' | 'count';
  color: string;
  points: { x: number; y: number }[];
  quantity: number;
  hidden: boolean;
  metadata: {
    createdAt?: string;
    lastModified?: string;
    confidence?: number;
  } | null;
  created_at?: string;
  updated_at?: string;
}

export interface MeasurementCreateBody {
  client_uuid: string;
  plan_client_uuid: string;
  takeoff_item_client_uuid: string;
  page: number;
  type: 'linear' | 'polyline' | 'area' | 'count';
  color: string;
  points: { x: number; y: number }[];
  quantity: number;
  hidden?: boolean;
  metadata?: ApiMeasurement['metadata'];
}

export type MeasurementPatchBody = Partial<
  Pick<
    MeasurementCreateBody,
    'points' | 'quantity' | 'color' | 'hidden' | 'metadata' | 'page' | 'type'
  >
>;

export const measurementSync = {
  list: (projectId: string) =>
    apiClient.get<{ data: { measurements: ApiMeasurement[] } }>(
      `/projects/${projectId}/measurements`
    ),
  create: (projectId: string, body: MeasurementCreateBody) =>
    apiClient.post<{ data: { measurement: ApiMeasurement } }>(
      `/projects/${projectId}/measurements`,
      body
    ),
  update: (projectId: string, clientUuid: string, patch: MeasurementPatchBody) =>
    apiClient.patch<{ data: { measurement: ApiMeasurement } }>(
      `/projects/${projectId}/measurements/${clientUuid}`,
      patch
    ),
  delete: (projectId: string, clientUuid: string) =>
    apiClient.delete<{ data?: unknown }>(
      `/projects/${projectId}/measurements/${clientUuid}`
    ),
};
