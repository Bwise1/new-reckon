import { useCallback } from "react";
import type { RefObject } from "react";
import type { Point, TakeoffItem } from "@/types/takeoff";
import { measurementBelongsToPlan } from "@/utils/planDocument";
import { getMeasurementType } from "@/utils/takeoffMeasurement";
import type { SpatialIndex } from "@/utils/spatialIndex";
import {
  calculateArea,
  calculateDistance,
  roundToPrecision,
} from "@/utils/measurementUtils";
import {
  findLineIntersection,
  findPerpendicularPoint,
} from "@/utils/spatialIndex";

interface UseCanvasInteractionsParams {
  takeoffItems: TakeoffItem[];
  activePlanId: string | null;
  currentPoints: Point[];
  currentPage: number;
  currentScale: number | null;
  isShiftPressed: boolean;
  stageScale: number;
  imageScale: number;
  spatialIndexRef: RefObject<SpatialIndex>;
  snapSettings: {
    vertex: boolean;
    perpendicular: boolean;
    intersection: boolean;
  };
}

// Screen-space snap radii in pixels — divided by stageScale to convert to canvas space
const SNAP_THRESHOLD_SCREEN = 14;
const PERPENDICULAR_SNAP_THRESHOLD_SCREEN = 18;
const INTERSECTION_SNAP_THRESHOLD_SCREEN = 14;
const ANGLE_SNAP_STEP_DEGREES = 45;

export const useCanvasInteractions = ({
  takeoffItems,
  activePlanId,
  currentPoints,
  currentPage,
  currentScale,
  isShiftPressed,
  stageScale,
  imageScale,
  spatialIndexRef,
  snapSettings,
}: UseCanvasInteractionsParams) => {
  const getSnappedPoint = useCallback(
    (
      point: Point,
      exclude?: { itemId: string; measurementId: string; pointIndex: number }
    ): Point | null => {
      const index = spatialIndexRef.current;
      // Convert screen-space thresholds to image-pixel space so snap feels the
      // same on any monitor / zoom level. Stored points and the incoming `point`
      // are already in image-pixel space.
      const effectiveScale = stageScale * (imageScale > 0 ? imageScale : 1);
      const snapThreshold = SNAP_THRESHOLD_SCREEN / effectiveScale;
      const perpThreshold = PERPENDICULAR_SNAP_THRESHOLD_SCREEN / effectiveScale;
      const intersectThreshold = INTERSECTION_SNAP_THRESHOLD_SCREEN / effectiveScale;

      let bestPoint: Point | null = null;
      let minDist = snapThreshold;

      // 1. Snap to vertices using spatial index
      if (snapSettings.vertex) {
        const vertexSnap = index.findNearestPoint(point, snapThreshold, exclude);
        if (vertexSnap && vertexSnap.distance < minDist) {
          minDist = vertexSnap.distance;
          bestPoint = vertexSnap.point;
        }
      }

      // 2. Check current in-progress points (not in spatial index yet)
      if (snapSettings.vertex) {
        currentPoints.forEach((p) => {
          const dist = calculateDistance(point, p);
          if (dist < minDist) {
            minDist = dist;
            bestPoint = p;
          }
        });
      }

      // 3. Snap to perpendicular lines
      if (snapSettings.perpendicular && currentPoints.length > 0) {
        takeoffItems.forEach((item) => {
          item.measurements
            .filter(
              (m) => measurementBelongsToPlan(m, activePlanId) && m.page === currentPage
            )
            .forEach((m) => {
              if (getMeasurementType(m, item) === "linear" && m.points.length === 2) {
                const perpPoint = findPerpendicularPoint(point, {
                  p1: m.points[0],
                  p2: m.points[1],
                });
                if (perpPoint) {
                  const dist = calculateDistance(point, perpPoint);
                  if (dist < perpThreshold && dist < minDist) {
                    minDist = dist;
                    bestPoint = perpPoint;
                  }
                }
              }
            });
        });
      }

      // 4. Snap to line intersections
      if (snapSettings.intersection && currentPoints.length > 0) {
        const lastPoint = currentPoints[currentPoints.length - 1];
        const currentLine = { p1: lastPoint, p2: point };

        takeoffItems.forEach((item) => {
          item.measurements
            .filter(
              (m) => measurementBelongsToPlan(m, activePlanId) && m.page === currentPage
            )
            .forEach((m) => {
              if (getMeasurementType(m, item) === "linear" && m.points.length === 2) {
                const intersection = findLineIntersection(currentLine, {
                  p1: m.points[0],
                  p2: m.points[1],
                });
                if (intersection) {
                  const dist = calculateDistance(point, intersection);
                  if (dist < intersectThreshold && dist < minDist) {
                    minDist = dist;
                    bestPoint = intersection;
                  }
                }
              }
            });
        });
      }

      return bestPoint;
    },
    [
      spatialIndexRef,
      stageScale,
      imageScale,
      currentPoints,
      takeoffItems,
      currentPage,
      activePlanId,
      snapSettings,
    ]
  );

  const getAngleSnappedPoint = useCallback(
    (point: Point, lastPoint: Point): Point => {
      if (!isShiftPressed) return point;
      const dx = point.x - lastPoint.x;
      const dy = point.y - lastPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance === 0) return point;

      // Snap direction to nearest fixed angle increment (0, 45, 90, ...)
      const rawAngle = Math.atan2(dy, dx);
      const angleStep = (ANGLE_SNAP_STEP_DEGREES * Math.PI) / 180;
      const snappedAngle = Math.round(rawAngle / angleStep) * angleStep;

      return {
        x: lastPoint.x + Math.cos(snappedAngle) * distance,
        y: lastPoint.y + Math.sin(snappedAngle) * distance,
      };
    },
    [isShiftPressed]
  );

  const formatDistance = useCallback((val: number): string => {
    return `${roundToPrecision(val, 2)}m`;
  }, []);

  const formatArea = useCallback((val: number): string => {
    return `${roundToPrecision(Math.abs(val), 2)} m²`;
  }, []);

  const calculateAreaFromPoints = useCallback(
    (points: Point[]): number => {
      const pixelArea = calculateArea(points);
      return currentScale && currentScale > 0
        ? pixelArea / (currentScale * currentScale)
        : pixelArea;
    },
    [currentScale]
  );

  const getEdgeMidpoints = useCallback((points: Point[]): Point[] => {
    if (points.length < 2) return [];
    const midpoints: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      midpoints.push({
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      });
    }
    return midpoints;
  }, []);

  return {
    getSnappedPoint,
    getAngleSnappedPoint,
    formatDistance,
    formatArea,
    calculateAreaFromPoints,
    getEdgeMidpoints,
  };
};

