import { apiClient } from '@/lib/api-client';
import type { BoqElementData, UnitType } from '@/types/takeoff';
import {
  computeQtyFromHistory,
  itemLabelFromIndex,
  parseRateNumber,
} from '@/utils/boqCalculations';

interface BoqProjectPayload {
  project: {
    id: string;
    title: string;
    project_type: 'bill_of_qty';
    location: string;
    vat_rate?: number;
    contingency?: number;
  };
  elements: Array<{
    id: number;
    header: string;
    items: Array<{
      id: string;
      header: string;
      description: string;
      measurements: Array<{
        unit: string;
        metric: string;
        value: number;
        rate: number;
        calculations: Array<{ is_adeduct: boolean; calculation: string[] }>;
      }>;
    }>;
  }>;
}

/** Matches mobile MeasurementsValues → API fields (unit = display metric, metric = category). */
const UNIT_PAYLOAD: Record<UnitType, { unit: string; metric: string }> = {
  m: { unit: 'm', metric: 'Length' },
  m2: { unit: 'm²', metric: 'Area' },
  m3: { unit: 'm³', metric: 'Volume' },
  nrs: { unit: 'nrs', metric: 'Numbers' },
  item: { unit: 'item', metric: 'Item' },
};


const itemQty = (item: BoqElementData['items'][number]): number => {
  if (item.history.length > 0) {
    return computeQtyFromHistory(item.history);
  }
  const parsed = Number.parseFloat(item.qty.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

// An item is "real" if the user entered anything meaningful into it — whether
// by drawing a measurement (history) OR by typing values manually (qty, rate,
// header, description). Empty seed items are qty '0' / rate '0' / m3 / no text.
const itemHasContent = (item: BoqElementData['items'][number]): boolean =>
  !!(item.header && item.header.trim()) ||
  !!(item.description && item.description.trim()) ||
  item.history.length > 0 ||
  itemQty(item) > 0 ||
  parseRateNumber(item.rate) > 0;

// The editor always seeds one blank element/item; those must not appear in
// exports (they showed up as an empty "ELEMENT NO.1" in the PDF/Excel).
export const elementHasContent = (element: BoqElementData): boolean =>
  element.items.some(itemHasContent);

// True when at least one element has real content — i.e. there is something
// worth exporting. Used to block exporting a BOQ that's still just the seed.
export const hasExportableBoq = (elements: BoqElementData[]): boolean =>
  elements.some(elementHasContent);

export const buildBoqPayload = ({
  projectId,
  title,
  location,
  elements,
  contingency,
  vatRate,
}: {
  projectId: string;
  title: string;
  location: string;
  elements: BoqElementData[];
  contingency: number;
  vatRate: number;
}): BoqProjectPayload => ({
  project: {
    id: projectId,
    title,
    project_type: 'bill_of_qty',
    location,
    contingency,
    vat_rate: vatRate,
  },
  // Drop empty (seed) elements so they don't print as a blank "ELEMENT NO.1".
  // Re-index after filtering so the remaining elements stay 1..N.
  elements: elements.filter(elementHasContent).map((element, elementIndex) => ({
    id: elementIndex + 1,
    header: element.title.toUpperCase(),
    items: element.items.filter(itemHasContent).map((item, itemIndex) => {
      const units = UNIT_PAYLOAD[item.unit] ?? UNIT_PAYLOAD.m3;
      return {
        id: itemLabelFromIndex(itemIndex),
        header: item.header,
        description: item.description,
        measurements: [
          {
            unit: units.unit,
            metric: units.metric,
            value: itemQty(item),
            rate: parseRateNumber(item.rate),
            calculations: item.history.map((entry) => ({
              is_adeduct: !!entry.isDeduct,
              calculation: [entry.value],
            })),
          },
        ],
      };
    }),
  })),
});

export const boqService = {
  getSuggestions: (type: "description" | "header") =>
    apiClient.get<{ data: { suggestions: Array<{ id: number; value: string }> } }>(
      `/suggestions?type=${encodeURIComponent(type)}`
    ),

  previewPdf: (payload: BoqProjectPayload) =>
    apiClient.post<{ data: { downloadUrl: string } }>('/projects/preview-pdf', payload),

  previewExcel: (payload: BoqProjectPayload) =>
    apiClient.post<{ data: { downloadUrl: string } }>('/projects/preview-excel', payload),

  initPayment: (projectId: string, email: string) =>
    apiClient.post<{ data: { reference: string; exportId: string } }>(`/payments/initialize/${projectId}`, { email }),

  verifyPayment: (reference: string) =>
    apiClient.get<{ data: { status: string; exportId?: string } }>(`/payments/verify?reference=${reference}`),

  exportPdf: (payload: BoqProjectPayload, exportId: string) =>
    apiClient.post<{ data: { downloadUrl: string } }>(`/projects/export?exportId=${exportId}`, payload),

  exportExcel: (payload: BoqProjectPayload, exportId: string) =>
    apiClient.post<{ data: { downloadUrl: string } }>(`/projects/export-excel?exportId=${exportId}`, payload),
};
