import { useCallback } from "react";
import type { RefObject } from "react";
import type { Point, TakeoffItem } from "@/types/takeoff";
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
  currentPoints: Point[];
  currentPage: number;
  currentScale: number | null;
  isShiftPressed: boolean;
  spatialIndexRef: RefObject<SpatialIndex>;
}

const SNAP_THRESHOLD = 25;
const PERPENDICULAR_SNAP_THRESHOLD = 30;
const INTERSECTION_SNAP_THRESHOLD = 25;

export const useCanvasInteractions = ({
  takeoffItems,
  currentPoints,
  currentPage,
  currentScale,
  isShiftPressed,
  spatialIndexRef,
}: UseCanvasInteractionsParams) => {
  const getSnappedPoint = useCallback(
    (
      point: Point,
      exclude?: { itemId: string; measurementId: string; pointIndex: number }
    ): Point | null => {
      const index = spatialIndexRef.current;
      let bestPoint: Point | null = null;
      let minDist = SNAP_THRESHOLD;

      // 1. Snap to vertices using spatial index
      const vertexSnap = index.findNearestPoint(point, SNAP_THRESHOLD, exclude);
      if (vertexSnap && vertexSnap.distance < minDist) {
        minDist = vertexSnap.distance;
        bestPoint = vertexSnap.point;
      }

      // 2. Check current points (not in index yet)
      currentPoints.forEach((p) => {
        const dist = calculateDistance(point, p);
        if (dist < minDist) {
          minDist = dist;
          bestPoint = p;
        }
      });

      // 3. Snap to perpendicular lines
      if (currentPoints.length > 0) {
        takeoffItems.forEach((item) => {
          item.measurements
            .filter((m) => m.page === currentPage)
            .forEach((m) => {
              if (item.type === "linear" && m.points.length === 2) {
                const perpPoint = findPerpendicularPoint(point, {
                  p1: m.points[0],
                  p2: m.points[1],
                });
                if (perpPoint) {
                  const dist = calculateDistance(point, perpPoint);
                  if (dist < PERPENDICULAR_SNAP_THRESHOLD && dist < minDist) {
                    minDist = dist;
                    bestPoint = perpPoint;
                  }
                }
              }
            });
        });
      }

      // 4. Snap to line intersections
      if (currentPoints.length > 0) {
        const lastPoint = currentPoints[currentPoints.length - 1];
        const currentLine = { p1: lastPoint, p2: point };

        takeoffItems.forEach((item) => {
          item.measurements
            .filter((m) => m.page === currentPage)
            .forEach((m) => {
              if (item.type === "linear" && m.points.length === 2) {
                const intersection = findLineIntersection(currentLine, {
                  p1: m.points[0],
                  p2: m.points[1],
                });
                if (intersection) {
                  const dist = calculateDistance(point, intersection);
                  if (dist < INTERSECTION_SNAP_THRESHOLD && dist < minDist) {
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
    [spatialIndexRef, currentPoints, takeoffItems, currentPage]
  );

  const getAngleSnappedPoint = useCallback(
    (point: Point, lastPoint: Point): Point => {
      if (!isShiftPressed) return point;
      const dx = Math.abs(point.x - lastPoint.x);
      const dy = Math.abs(point.y - lastPoint.y);
      // Snap to horizontal or vertical
      if (dx > dy) {
        return { x: point.x, y: lastPoint.y }; // Horizontal
      } else {
        return { x: lastPoint.x, y: point.y }; // Vertical
      }
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

