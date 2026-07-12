import type { BoqElementData, UnitType } from '@/types/takeoff';
import {
  computeQtyFromHistory,
  elementTitleFromIndex,
  parseRateNumber,
} from '@/utils/boqCalculations';

const UNIT_PAYLOAD: Record<UnitType, { unit: string; metric: string }> = {
  m: { unit: 'm', metric: 'Length' },
  m2: { unit: 'm²', metric: 'Area' },
  m3: { unit: 'm³', metric: 'Volume' },
  nrs: { unit: 'nrs', metric: 'Numbers' },
  item: { unit: 'item', metric: 'Item' },
};

const METRIC_TO_UNIT: Record<string, UnitType> = {
  Length: 'm',
  Area: 'm2',
  Volume: 'm3',
  Numbers: 'nrs',
  Item: 'item',
};

const elementHeader = (element: BoqElementData): string => {
  const fromItem = element.items.map((i) => i.header.trim()).find(Boolean);
  return fromItem || element.title;
};

const itemQty = (item: BoqElementData['items'][number]): number => {
  if (item.history.length > 0) {
    return computeQtyFromHistory(item.history);
  }
  const parsed = Number.parseFloat(item.qty.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface BoqSyncPayload {
  client_uuid: string;
  updated_at: string;
  elements: Array<{
    client_uuid: string;
    sort_order: number;
    header: string;
    items: Array<{
      client_uuid: string;
      sort_order: number;
      description: string;
      measurement: {
        client_uuid: string;
        unit: string;
        metric: string;
        value: number;
        rate: number;
        calculations: Array<{
          client_uuid: string;
          is_adeduct: boolean;
          calculation: string[];
          result: string;
        }>;
      };
    }>;
  }>;
}

export const buildBoqSyncPayload = ({
  clientUuid,
  elements,
  updatedAt = new Date().toISOString(),
}: {
  clientUuid: string;
  elements: BoqElementData[];
  updatedAt?: string;
}): BoqSyncPayload => ({
  client_uuid: clientUuid,
  updated_at: updatedAt,
  elements: elements.map((element, elementIndex) => ({
    client_uuid: element.id,
    sort_order: elementIndex,
    header: elementHeader(element),
    items: element.items.map((item, itemIndex) => {
      const units = UNIT_PAYLOAD[item.unit] ?? UNIT_PAYLOAD.m3;
      return {
        client_uuid: item.id,
        sort_order: itemIndex,
        description: item.description,
        measurement: {
          client_uuid: `${item.id}_measurement`,
          unit: units.unit,
          metric: units.metric,
          value: itemQty(item),
          rate: parseRateNumber(item.rate),
          calculations: item.history.map((entry) => ({
            client_uuid: entry.id,
            is_adeduct: !!entry.isDeduct,
            calculation: [entry.value],
            result: entry.value,
          })),
        },
      };
    }),
  })),
});

export const mapPulledBoqToElements = (
  pulled: BoqSyncPayload
): BoqElementData[] => {
  if (!pulled.elements?.length) {
    return [];
  }

  // Deduplicate by client_uuid — the server should guarantee uniqueness, but guard here too
  const seen = new Set<string>();
  const unique = pulled.elements.filter((e) => {
    if (!e.client_uuid || seen.has(e.client_uuid)) return false;
    seen.add(e.client_uuid);
    return true;
  });

  return unique.map((element, elementIndex) => ({
    id: element.client_uuid,
    title: element.header?.trim() || elementTitleFromIndex(elementIndex),
    items: (element.items ?? []).map((item, itemIndex) => {
      const measurement = item.measurement;
      const metric = measurement?.metric ?? 'Volume';
      const unit: UnitType = METRIC_TO_UNIT[metric] ?? 'm3';

      return {
        id: item.client_uuid,
        unit,
        header: itemIndex === 0 ? element.header ?? '' : '',
        description: item.description ?? '',
        qty: String(measurement?.value ?? 0),
        rate: String(measurement?.rate ?? 0),
        history: (measurement?.calculations ?? []).map((calc) => ({
          id: calc.client_uuid,
          value: Array.isArray(calc.calculation)
            ? calc.calculation.join('')
            : String(calc.calculation ?? ''),
          isDeduct: !!calc.is_adeduct,
        })),
      };
    }),
  }));
};

/** For logging / display only */
export const describeBoqSync = (payload: BoqSyncPayload): string =>
  `${payload.elements.length} elements, ${payload.elements.reduce((n, e) => n + e.items.length, 0)} items`;

