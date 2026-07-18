import type { CalibrationLine, Measurement, ProjectPlan, TakeoffItem } from '@/types/takeoff';
import { inferPlanMediaKind, isImageMimeType, isPdfMimeType } from '@/utils/planMediaLoader';

export const LEGACY_PLAN_ID = 'legacy-plan';

/** Drop blob URLs and PDF URLs — they cannot be used as canvas image sources after reload. */
export const sanitizePersistedBackground = (
  background: string | null | undefined
): string | null => {
  if (!background) return null;
  if (background.startsWith('blob:')) return null;
  if (isPdfMimeType(null, background)) return null;
  return background;
};

/**
 * PDF plans render via pdf.js (backgroundImage must stay null).
 * Image plans may use a data URL, or fall back to the plan's Cloudinary URL.
 */
export const resolvePlanBackgroundForCanvas = (
  plan: Pick<ProjectPlan, 'mimeType' | 'url'> | undefined,
  savedBackground: string | null | undefined
): string | null => {
  if (plan && inferPlanMediaKind(plan) === 'pdf') {
    return null;
  }
  const saved = sanitizePersistedBackground(savedBackground);
  if (saved) return saved;
  if (plan && isImageMimeType(plan.mimeType, plan.url) && plan.url) {
    return plan.url;
  }
  return null;
};

export const hydrateActivePlanView = (state: {
  plans: ProjectPlan[];
  activePlanId: string | null;
  planStates: Record<string, PlanDocumentState>;
  backgroundImage?: string | null;
  numPages?: number;
  currentPage?: number;
  scales?: Record<number, number>;
  calibrationLines?: Record<number, CalibrationLine>;
  rotations?: Record<number, number>;
}): {
  backgroundImage: string | null;
  numPages: number;
  currentPage: number;
  scales: Record<number, number>;
  calibrationLines: Record<number, CalibrationLine>;
  rotations: Record<number, number>;
} => {
  if (!state.activePlanId) {
    return {
      backgroundImage: null,
      numPages: state.numPages ?? 0,
      currentPage: state.currentPage ?? 1,
      scales: state.scales ?? {},
      calibrationLines: state.calibrationLines ?? {},
      rotations: state.rotations ?? {},
    };
  }

  const plan = state.plans.find((p) => p.id === state.activePlanId);
  const doc = state.planStates[state.activePlanId] ?? emptyPlanDocumentState();

  return {
    backgroundImage: resolvePlanBackgroundForCanvas(plan, doc.backgroundImage),
    numPages: doc.numPages || plan?.pageCount || state.numPages || 0,
    currentPage: doc.currentPage || state.currentPage || 1,
    scales: doc.scales,
    calibrationLines: doc.calibrationLines,
    rotations: doc.rotations ?? {},
  };
};

export interface PlanDocumentState {
  backgroundImage: string | null;
  numPages: number;
  currentPage: number;
  scales: Record<number, number>;
  calibrationLines: Record<number, CalibrationLine>;
  /** Per-page rotation in degrees (0, 90, 180, 270). Missing key = 0. */
  rotations: Record<number, number>;
}

export const emptyPlanDocumentState = (): PlanDocumentState => ({
  backgroundImage: null,
  numPages: 0,
  currentPage: 1,
  scales: {},
  calibrationLines: {},
  rotations: {},
});

export const measurementBelongsToPlan = (
  measurement: Measurement,
  planId: string | null
): boolean => {
  if (!planId) return false;
  const measurementPlanId = measurement.planId ?? LEGACY_PLAN_ID;
  return measurementPlanId === planId;
};

export const filterMeasurementsForView = (
  takeoffItems: TakeoffItem[],
  planId: string | null,
  page: number
): Array<{ item: TakeoffItem; measurement: Measurement }> => {
  if (!planId) return [];

  const results: Array<{ item: TakeoffItem; measurement: Measurement }> = [];
  for (const item of takeoffItems) {
    for (const measurement of item.measurements) {
      if (measurementBelongsToPlan(measurement, planId) && measurement.page === page) {
        results.push({ item, measurement });
      }
    }
  }
  return results;
};

export const assignPlanIdToMeasurements = (
  takeoffItems: TakeoffItem[],
  planId: string
): TakeoffItem[] =>
  takeoffItems.map((item) => ({
    ...item,
    measurements: item.measurements.map((measurement) => ({
      ...measurement,
      planId: measurement.planId ?? planId,
    })),
  }));

export const migrateToPlanDocuments = (data: {
  backgroundImage: string | null;
  numPages: number;
  currentPage: number;
  scales: Record<number, number> | Record<string, Record<number, number>>;
  calibrationLines:
    | Record<number, CalibrationLine>
    | Record<string, Record<number, CalibrationLine>>;
  takeoffItems: TakeoffItem[];
  plans?: ProjectPlan[];
  activePlanId?: string | null;
  planStates?: Record<string, PlanDocumentState>;
}): {
  plans: ProjectPlan[];
  activePlanId: string;
  planStates: Record<string, PlanDocumentState>;
  takeoffItems: TakeoffItem[];
  backgroundImage: string | null;
  numPages: number;
  currentPage: number;
  scales: Record<number, number>;
  calibrationLines: Record<number, CalibrationLine>;
} => {
  if (data.plans?.length && data.planStates && data.activePlanId) {
    const activePlan = data.plans.find((p) => p.id === data.activePlanId);
    const activeState = data.planStates[data.activePlanId] ?? emptyPlanDocumentState();
    return {
      plans: data.plans,
      activePlanId: data.activePlanId,
      planStates: data.planStates,
      takeoffItems: assignPlanIdToMeasurements(data.takeoffItems, data.activePlanId),
      backgroundImage: resolvePlanBackgroundForCanvas(
        activePlan,
        activeState.backgroundImage
      ),
      numPages: activeState.numPages,
      currentPage: activeState.currentPage,
      scales: activeState.scales,
      calibrationLines: activeState.calibrationLines,
    };
  }

  const hasLegacyCanvas =
    Boolean(data.backgroundImage) ||
    data.numPages > 0 ||
    data.takeoffItems.some((item) => item.measurements.length > 0);

  if (!hasLegacyCanvas) {
    return {
      plans: [],
      activePlanId: '',
      planStates: {},
      takeoffItems: data.takeoffItems,
      backgroundImage: null,
      numPages: 0,
      currentPage: 1,
      scales: {},
      calibrationLines: {},
    };
  }

  const legacyPlan: ProjectPlan = {
    id: LEGACY_PLAN_ID,
    name: 'Drawing 1',
    pageCount: data.numPages || 1,
    sortOrder: 0,
  };

  const legacyScales =
    typeof Object.values(data.scales)[0] === 'object'
      ? ((data.scales as Record<string, Record<number, number>>)[LEGACY_PLAN_ID] ?? {})
      : (data.scales as Record<number, number>);

  const legacyCalibration =
    typeof Object.values(data.calibrationLines)[0] === 'object' &&
    data.calibrationLines &&
    !('p1' in (Object.values(data.calibrationLines)[0] as object))
      ? ((data.calibrationLines as Record<string, Record<number, CalibrationLine>>)[
          LEGACY_PLAN_ID
        ] ?? {})
      : (data.calibrationLines as Record<number, CalibrationLine>);

  const planStates: Record<string, PlanDocumentState> = {
    [LEGACY_PLAN_ID]: {
      backgroundImage: data.backgroundImage,
      numPages: data.numPages,
      currentPage: data.currentPage || 1,
      scales: legacyScales,
      calibrationLines: legacyCalibration,
    },
  };

  return {
    plans: [legacyPlan],
    activePlanId: LEGACY_PLAN_ID,
    planStates,
    takeoffItems: assignPlanIdToMeasurements(data.takeoffItems, LEGACY_PLAN_ID),
    backgroundImage: data.backgroundImage,
    numPages: data.numPages,
    currentPage: data.currentPage || 1,
    scales: legacyScales,
    calibrationLines: legacyCalibration,
  };
};
