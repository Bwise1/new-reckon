/**
 * High-precision measurement calculation utilities
 * Provides accurate calculations with proper error handling and validation
 */

import type { Point, Measurement } from '@/types/takeoff';

// Precision constants
const EPSILON = 1e-10; // For floating point comparisons
const MIN_DISTANCE = 0.001; // Minimum valid distance in pixels
const MIN_AREA = 0.0001; // Minimum valid area in pixels²

/**
 * Calculate distance between two points with high precision
 */
export const calculateDistance = (p1: Point, p2: Point): number => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // Handle edge cases
  if (!isFinite(dist) || isNaN(dist)) {
    return 0;
  }
  
  return dist;
};

/**
 * Calculate area using Shoelace formula with improved precision
 * Handles edge cases and validates polygon
 */
export const calculateArea = (points: Point[]): number => {
  if (points.length < 3) {
    return 0;
  }

  // Check for degenerate cases
  if (points.length === 3) {
    const dist1 = calculateDistance(points[0], points[1]);
    const dist2 = calculateDistance(points[1], points[2]);
    const dist3 = calculateDistance(points[2], points[0]);
    
    // If all points are collinear or too close, area is effectively zero
    if (dist1 < MIN_DISTANCE || dist2 < MIN_DISTANCE || dist3 < MIN_DISTANCE) {
      return 0;
    }
    
    // Check if points are collinear (area of triangle would be near zero)
    const area = Math.abs(
      (points[0].x * (points[1].y - points[2].y) +
       points[1].x * (points[2].y - points[0].y) +
       points[2].x * (points[0].y - points[1].y)) / 2
    );
    
    if (area < MIN_AREA) {
      return 0;
    }
  }

  // Shoelace formula with improved precision
  let area = 0;
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  
  const result = Math.abs(area / 2);
  
  // Validate result
  if (!isFinite(result) || isNaN(result)) {
    return 0;
  }
  
  return result < MIN_AREA ? 0 : result;
};

/**
 * Check if a polygon is self-intersecting
 * Uses line segment intersection detection
 */
export const isSelfIntersecting = (points: Point[]): boolean => {
  if (points.length < 4) {
    return false; // Triangles and lines can't self-intersect
  }

  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    
    // Check against non-adjacent edges
    for (let j = i + 2; j < n; j++) {
      // Skip last edge if checking first edge (they're adjacent)
      if (i === 0 && j === n - 1) {
        continue;
      }
      
      const p3 = points[j];
      const p4 = points[(j + 1) % n];
      
      if (doSegmentsIntersect(p1, p2, p3, p4)) {
        return true;
      }
    }
  }
  
  return false;
};

/**
 * Check if two line segments intersect
 */
const doSegmentsIntersect = (p1: Point, p2: Point, p3: Point, p4: Point): boolean => {
  // Using cross product method for line segment intersection
  const d1 = crossProduct(p3, p4, p1);
  const d2 = crossProduct(p3, p4, p2);
  const d3 = crossProduct(p1, p2, p3);
  const d4 = crossProduct(p1, p2, p4);
  
  // Check if segments are on opposite sides
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  
  // Check for collinear cases
  if (Math.abs(d1) < EPSILON && isPointOnSegment(p3, p4, p1)) return true;
  if (Math.abs(d2) < EPSILON && isPointOnSegment(p3, p4, p2)) return true;
  if (Math.abs(d3) < EPSILON && isPointOnSegment(p1, p2, p3)) return true;
  if (Math.abs(d4) < EPSILON && isPointOnSegment(p1, p2, p4)) return true;
  
  return false;
};

/**
 * Calculate cross product for three points
 */
const crossProduct = (p1: Point, p2: Point, p3: Point): number => {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
};

/**
 * Check if a point lies on a line segment
 */
const isPointOnSegment = (p1: Point, p2: Point, p: Point): boolean => {
  const dist1 = calculateDistance(p1, p);
  const dist2 = calculateDistance(p2, p);
  const dist3 = calculateDistance(p1, p2);
  
  return Math.abs(dist1 + dist2 - dist3) < EPSILON;
};

/**
 * Validate a measurement based on its type
 */
export const validateMeasurement = (
  measurement: Measurement,
  type: 'linear' | 'area' | 'count'
): { isValid: boolean; error?: string } => {
  // Check for required points
  if (type === 'linear' && measurement.points.length !== 2) {
    return { isValid: false, error: 'Linear measurement requires exactly 2 points' };
  }
  
  if (type === 'area' && measurement.points.length < 3) {
    return { isValid: false, error: 'Area measurement requires at least 3 points' };
  }
  
  if (type === 'count' && measurement.points.length < 1) {
    return { isValid: false, error: 'Count measurement requires at least 1 point' };
  }
  
  // Validate points
  for (const point of measurement.points) {
    if (!isFinite(point.x) || !isFinite(point.y) || isNaN(point.x) || isNaN(point.y)) {
      return { isValid: false, error: 'Invalid point coordinates' };
    }
  }
  
  // Type-specific validation
  if (type === 'linear') {
    const dist = calculateDistance(measurement.points[0], measurement.points[1]);
    if (dist < MIN_DISTANCE) {
      return { isValid: false, error: 'Line segment is too short' };
    }
  }
  
  if (type === 'area') {
    // Check for self-intersection
    if (isSelfIntersecting(measurement.points)) {
      return { isValid: false, error: 'Polygon is self-intersecting' };
    }
    
    // Check for degenerate polygon
    const area = calculateArea(measurement.points);
    if (area < MIN_AREA) {
      return { isValid: false, error: 'Polygon area is too small or degenerate' };
    }
    
    // Check for duplicate consecutive points
    for (let i = 0; i < measurement.points.length; i++) {
      const next = (i + 1) % measurement.points.length;
      if (calculateDistance(measurement.points[i], measurement.points[next]) < MIN_DISTANCE) {
        return { isValid: false, error: 'Polygon has duplicate consecutive points' };
      }
    }
  }
  
  // Validate quantity
  if (!isFinite(measurement.quantity) || isNaN(measurement.quantity)) {
    return { isValid: false, error: 'Invalid quantity value' };
  }
  
  return { isValid: true };
};

/**
 * Calculate quantity from points with scale
 */
export const calculateQuantity = (
  points: Point[],
  type: 'linear' | 'area',
  scale: number | null
): number => {
  if (type === 'linear' && points.length === 2) {
    const dist = calculateDistance(points[0], points[1]);
    return scale && scale > 0 ? dist / scale : dist;
  }
  
  if (type === 'area' && points.length >= 3) {
    const area = calculateArea(points);
    return scale && scale > 0 ? area / (scale * scale) : area;
  }
  
  return 0;
};

/**
 * Round to specified decimal places with proper handling
 */
export const roundToPrecision = (value: number, decimals: number = 2): number => {
  if (!isFinite(value) || isNaN(value)) {
    return 0;
  }
  
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

/**
 * Check if two points are approximately equal (within epsilon)
 */
export const pointsEqual = (p1: Point, p2: Point, epsilon: number = EPSILON): boolean => {
  return Math.abs(p1.x - p2.x) < epsilon && Math.abs(p1.y - p2.y) < epsilon;
};

/**
 * Validate scale value
 */
export const validateScale = (scale: number | null): { isValid: boolean; error?: string } => {
  if (scale === null) {
    return { isValid: true }; // Null scale is valid (uncalibrated)
  }
  
  if (!isFinite(scale) || isNaN(scale)) {
    return { isValid: false, error: 'Scale must be a valid number' };
  }
  
  if (scale <= 0) {
    return { isValid: false, error: 'Scale must be positive' };
  }
  
  if (scale > 1000000) {
    return { isValid: false, error: 'Scale value is unreasonably large' };
  }
  
  if (scale < 0.000001) {
    return { isValid: false, error: 'Scale value is unreasonably small' };
  }
  
  return { isValid: true };
};

