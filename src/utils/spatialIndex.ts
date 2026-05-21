/**
 * Spatial indexing for efficient point/vertex lookup
 * Uses grid-based spatial hash for O(1) average-case lookups
 */

import type { Point } from '@/types/takeoff';

interface SpatialCell {
  points: Array<{ point: Point; itemId: string; measurementId: string; pointIndex: number }>;
}

/**
 * Grid-based spatial index for fast point lookups
 */
export class SpatialIndex {
  private grid: Map<string, SpatialCell>;
  private cellSize: number;
  private bounds: { minX: number; minY: number; maxX: number; maxY: number };

  constructor(cellSize: number = 50) {
    this.grid = new Map();
    this.cellSize = cellSize;
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }

  /**
   * Convert point coordinates to grid cell key
   */
  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  /**
   * Get all cell keys that a point might be in (including neighbors for boundary cases)
   */
  private getCellKeys(point: Point, threshold: number): string[] {
    const keys = new Set<string>();
    
    // Check the point's cell and neighboring cells within threshold
    const cellX = Math.floor(point.x / this.cellSize);
    const cellY = Math.floor(point.y / this.cellSize);
    
    // Calculate how many cells to check based on threshold
    const cellRadius = Math.ceil(threshold / this.cellSize) + 1;
    
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        keys.add(`${cellX + dx},${cellY + dy}`);
      }
    }
    
    return Array.from(keys);
  }

  /**
   * Add a point to the index
   */
  addPoint(
    point: Point,
    itemId: string,
    measurementId: string,
    pointIndex: number
  ): void {
    const key = this.getCellKey(point.x, point.y);
    
    if (!this.grid.has(key)) {
      this.grid.set(key, { points: [] });
    }
    
    const cell = this.grid.get(key)!;
    cell.points.push({ point, itemId, measurementId, pointIndex });
    
    // Update bounds
    this.bounds.minX = Math.min(this.bounds.minX, point.x);
    this.bounds.minY = Math.min(this.bounds.minY, point.y);
    this.bounds.maxX = Math.max(this.bounds.maxX, point.x);
    this.bounds.maxY = Math.max(this.bounds.maxY, point.y);
  }

  /**
   * Remove a point from the index
   */
  removePoint(
    point: Point,
    itemId: string,
    measurementId: string,
    pointIndex: number
  ): void {
    const key = this.getCellKey(point.x, point.y);
    const cell = this.grid.get(key);
    
    if (!cell) return;
    
    cell.points = cell.points.filter(
      (p) =>
        !(p.itemId === itemId &&
          p.measurementId === measurementId &&
          p.pointIndex === pointIndex)
    );
    
    // Remove empty cells to save memory
    if (cell.points.length === 0) {
      this.grid.delete(key);
    }
  }

  /**
   * Update a point's position (remove old, add new)
   */
  updatePoint(
    oldPoint: Point,
    newPoint: Point,
    itemId: string,
    measurementId: string,
    pointIndex: number
  ): void {
    const oldKey = this.getCellKey(oldPoint.x, oldPoint.y);
    const newKey = this.getCellKey(newPoint.x, newPoint.y);
    
    // If same cell, just update the point
    if (oldKey === newKey) {
      const cell = this.grid.get(oldKey);
      if (cell) {
        const pointData = cell.points.find(
          (p) =>
            p.itemId === itemId &&
            p.measurementId === measurementId &&
            p.pointIndex === pointIndex
        );
        if (pointData) {
          pointData.point = newPoint;
        }
      }
      return;
    }
    
    // Different cells - remove from old, add to new
    this.removePoint(oldPoint, itemId, measurementId, pointIndex);
    this.addPoint(newPoint, itemId, measurementId, pointIndex);
  }

  /**
   * Find nearest point within threshold distance
   */
  findNearestPoint(
    queryPoint: Point,
    threshold: number,
    exclude?: { itemId: string; measurementId: string; pointIndex: number }
  ): { point: Point; itemId: string; measurementId: string; pointIndex: number; distance: number } | null {
    let nearest: { point: Point; itemId: string; measurementId: string; pointIndex: number; distance: number } | null = null;
    let minDist = threshold;

    // Check all relevant cells
    const cellKeys = this.getCellKeys(queryPoint, threshold);
    
    for (const key of cellKeys) {
      const cell = this.grid.get(key);
      if (!cell) continue;
      
      for (const pointData of cell.points) {
        // Skip excluded point
        if (
          exclude &&
          pointData.itemId === exclude.itemId &&
          pointData.measurementId === exclude.measurementId &&
          pointData.pointIndex === exclude.pointIndex
        ) {
          continue;
        }
        
        const dx = queryPoint.x - pointData.point.x;
        const dy = queryPoint.y - pointData.point.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < minDist) {
          minDist = dist;
          nearest = {
            ...pointData,
            distance: dist,
          };
        }
      }
    }
    
    return nearest;
  }

  /**
   * Find all points within threshold distance
   */
  findPointsInRadius(
    queryPoint: Point,
    threshold: number
  ): Array<{ point: Point; itemId: string; measurementId: string; pointIndex: number; distance: number }> {
    const results: Array<{ point: Point; itemId: string; measurementId: string; pointIndex: number; distance: number }> = [];
    const cellKeys = this.getCellKeys(queryPoint, threshold);
    
    for (const key of cellKeys) {
      const cell = this.grid.get(key);
      if (!cell) continue;
      
      for (const pointData of cell.points) {
        const dx = queryPoint.x - pointData.point.x;
        const dy = queryPoint.y - pointData.point.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist <= threshold) {
          results.push({
            ...pointData,
            distance: dist,
          });
        }
      }
    }
    
    // Sort by distance
    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  /**
   * Clear all points from the index
   */
  clear(): void {
    this.grid.clear();
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }

  /**
   * Rebuild index from scratch (useful after bulk updates)
   */
  rebuild(
    points: Array<{
      point: Point;
      itemId: string;
      measurementId: string;
      pointIndex: number;
    }>
  ): void {
    this.clear();
    for (const pointData of points) {
      this.addPoint(
        pointData.point,
        pointData.itemId,
        pointData.measurementId,
        pointData.pointIndex
      );
    }
  }

  /**
   * Get statistics about the index
   */
  getStats(): {
    totalPoints: number;
    totalCells: number;
    avgPointsPerCell: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  } {
    let totalPoints = 0;
    for (const cell of this.grid.values()) {
      totalPoints += cell.points.length;
    }
    
    return {
      totalPoints,
      totalCells: this.grid.size,
      avgPointsPerCell: this.grid.size > 0 ? totalPoints / this.grid.size : 0,
      bounds: { ...this.bounds },
    };
  }
}

/**
 * Helper to find line intersections for snapping
 */
export interface LineSegment {
  p1: Point;
  p2: Point;
  itemId: string;
  measurementId: string;
}

/**
 * Find intersection point of two line segments
 */
export const findLineIntersection = (
  line1: { p1: Point; p2: Point },
  line2: { p1: Point; p2: Point }
): Point | null => {
  const x1 = line1.p1.x;
  const y1 = line1.p1.y;
  const x2 = line1.p2.x;
  const y2 = line1.p2.y;
  const x3 = line2.p1.x;
  const y3 = line2.p1.y;
  const x4 = line2.p2.x;
  const y4 = line2.p2.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  
  if (Math.abs(denom) < 1e-10) {
    return null; // Lines are parallel
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // Check if intersection is within both segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    };
  }

  return null;
};

/**
 * Find perpendicular point from a point to a line segment
 */
export const findPerpendicularPoint = (
  point: Point,
  line: { p1: Point; p2: Point }
): Point | null => {
  const dx = line.p2.x - line.p1.x;
  const dy = line.p2.y - line.p1.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq < 1e-10) {
    return null; // Line segment is degenerate
  }

  const t = Math.max(0, Math.min(1, ((point.x - line.p1.x) * dx + (point.y - line.p1.y) * dy) / lengthSq));
  
  return {
    x: line.p1.x + t * dx,
    y: line.p1.y + t * dy,
  };
};

