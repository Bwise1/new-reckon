import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Line,
  Circle,
  Text,
  Group,
  Rect,
} from "react-konva";
import {
  ZoomIn,
  ZoomOut,
  Move,
  Ruler,
  FileUp,
  ChevronLeft,
  ChevronRight,
  Scissors,
  Undo2,
  RotateCcw,
  MousePointer2,
  Check,
  AlertCircle,
} from "lucide-react";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import SaveIndicator from "@/components/ui/SaveIndicator";
import type { Point, Measurement } from "@/types/takeoff";
import * as pdfjsLib from "pdfjs-dist";
import type Konva from "konva";
import {
  SpatialIndex,
  findLineIntersection,
  findPerpendicularPoint,
} from "@/utils/spatialIndex";
import {
  calculateDistance,
  calculateArea,
  calculateQuantity,
  validateMeasurement,
  roundToPrecision,
  validateScale,
} from "@/utils/measurementUtils";

const MIN_DISTANCE = 0.001; // Minimum valid distance in pixels

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const SNAP_THRESHOLD = 25; // Increased for easier snapping
const PERPENDICULAR_SNAP_THRESHOLD = 30; // Threshold for perpendicular snapping
const INTERSECTION_SNAP_THRESHOLD = 25; // Threshold for intersection snapping

const FloorPlanCanvas: React.FC = () => {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const spatialIndexRef = useRef<SpatialIndex>(new SpatialIndex(50));

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  const [isPanningMode, setIsPanningMode] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isDeductionMode, setIsDeductionMode] = useState(false);
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [snappedPoint, setSnappedPoint] = useState<Point | null>(null);
  const [selectedMeasurement, setSelectedMeasurement] = useState<{
    itemId: string;
    measurementId: string;
  } | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{
    itemId: string;
    measurementId: string;
    pointIndex: number;
  } | null>(null);
  const [hoveredMeasurement, setHoveredMeasurement] = useState<{
    itemId: string;
    measurementId: string;
  } | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{
    itemId: string;
    measurementId: string;
    edgeIndex: number;
  } | null>(null);
  const selectedShapeRef = useRef<any>(null);
  const [activeDragPoint, setActiveDragPoint] = useState<{
    itemId: string;
    measurementId: string;
    pointIndex: number;
    pos: Point;
  } | null>(null);

  const [calibrationPoint1, setCalibrationPoint1] = useState<Point | null>(
    null
  );
  const [calibrationDistance, setCalibrationDistance] = useState<string>("");

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);

  const {
    takeoffItems,
    activeItemId,
    scales,
    calibrationMode,
    currentPage,
    setCalibrationMode,
    setScale,
    setCalibrationLine,
    setCurrentPage,
    setNumPages: setStoreNumPages,
    addMeasurement,
    updateTakeoffItem,
    removeMeasurement,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useTakeoffStore();

  const currentScale = scales[currentPage] || null;
  const activeItem = takeoffItems.find((i) => i.id === activeItemId);

  // Rebuild spatial index when measurements change
  useEffect(() => {
    const index = spatialIndexRef.current;
    index.clear();

    takeoffItems.forEach((item) => {
      item.measurements
        .filter((m) => m.page === currentPage)
        .forEach((m) => {
          m.points.forEach((p, idx) => {
            index.addPoint(p, item.id, m.id, idx);
          });
        });
    });
  }, [takeoffItems, currentPage]);

  // Handle window resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Advanced snapping with spatial index
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
    [takeoffItems, currentPoints, currentPage]
  );

  // Snap to angle (horizontal/vertical when Shift pressed)
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

  // Format distance for display
  const formatDistance = useCallback((val: number): string => {
    return `${roundToPrecision(val, 2)}m`;
  }, []);

  // Format area for display
  const formatArea = useCallback((val: number): string => {
    return `${roundToPrecision(Math.abs(val), 2)} m²`;
  }, []);

  // Calculate area from points using utility function (memoized)
  const calculateAreaFromPoints = useCallback(
    (points: Point[]): number => {
      const pixelArea = calculateArea(points);
      return currentScale && currentScale > 0
        ? pixelArea / (currentScale * currentScale)
        : pixelArea;
    },
    [currentScale]
  );

  // Handle PDF upload and rendering
  const renderPdfPage = useCallback(
    async (pdf: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      setImage(canvas as unknown as HTMLImageElement);

      // Calculate dimensions to fit the container width
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const scaleFactor = containerWidth / canvas.width;

        // Store the image scale factor
        setImageScale(scaleFactor);

        // Set canvas size to match scaled image dimensions
        setStageSize({
          width: containerWidth,
          height: canvas.height * scaleFactor,
        });

        // Reset stage transformations
        setStageScale(1);
        setStagePos({ x: 0, y: 0 });
      }
    },
    []
  );

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.type === "application/pdf") {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setStoreNumPages(pdf.numPages);
        setCurrentPage(1);
        renderPdfPage(pdf, 1);
      } else if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new window.Image();
          img.src = ev.target?.result as string;
          img.onload = () => {
            setImage(img);

            // Calculate dimensions to fit the container width
            const container = document.getElementById("canvas-container");
            if (container) {
              const containerWidth = container.offsetWidth;
              const scaleFactor = containerWidth / img.width;

              // Store the image scale factor
              setImageScale(scaleFactor);

              // Set canvas size to match scaled image dimensions
              setStageSize({
                width: containerWidth,
                height: img.height * scaleFactor,
              });

              // Reset stage transformations
              setStageScale(1);
              setStagePos({ x: 0, y: 0 });
            }
          };
        };
        reader.readAsDataURL(file);
      }
    },
    [stageSize, renderPdfPage, setCurrentPage, setStoreNumPages]
  );

  // Handle PDF page navigation
  const changePage = useCallback(
    (delta: number) => {
      if (!pdfDoc) return;
      const newPage = Math.max(1, Math.min(numPages, currentPage + delta));
      if (newPage !== currentPage) {
        setCurrentPage(newPage);
        renderPdfPage(pdfDoc, newPage);
      }
    },
    [pdfDoc, numPages, currentPage, renderPdfPage, setCurrentPage]
  );

  // Calculate edge midpoints for adding new vertices
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

  // Add vertex at edge midpoint
  const handleEdgeMidpointDrag = useCallback(
    (
      itemId: string,
      measurementId: string,
      edgeIndex: number,
      newPos: Point
    ) => {
      const item = takeoffItems.find((i) => i.id === itemId);
      if (!item) return;

      const measurement = item.measurements.find((m) => m.id === measurementId);
      if (!measurement || measurement.points.length < 2) return;

      // Insert new vertex after the edge start point
      const updatedPoints = [...measurement.points];
      updatedPoints.splice(edgeIndex + 1, 0, newPos);

      // Recalculate quantity for area measurements
      let newQuantity = measurement.quantity;
      if (item.type === "area") {
        const area = calculateAreaFromPoints(updatedPoints);
        newQuantity = measurement.quantity < 0 ? -area : area;
      } else if (item.type === "linear" && updatedPoints.length === 2) {
        newQuantity = calculateQuantity(updatedPoints, "linear", currentScale);
      }

      const oldTotal = item.totalQuantity;
      const diff = newQuantity - measurement.quantity;
      const newTotal = oldTotal + diff;

      const now = new Date().toISOString();
      const updatedMetadata = {
        ...measurement.metadata,
        lastModified: now,
        createdAt: measurement.metadata?.createdAt || now,
      };

      const updatedMeasurements = item.measurements.map((m) =>
        m.id === measurementId
          ? {
              ...m,
              points: updatedPoints,
              quantity: newQuantity,
              metadata: updatedMetadata,
            }
          : m
      );

      updateTakeoffItem(itemId, {
        measurements: updatedMeasurements,
        totalQuantity: newTotal,
      });
    },
    [
      takeoffItems,
      currentScale,
      calculateArea,
      updateTakeoffItem,
      isShiftPressed,
    ]
  );

  // Handle canvas click
  const handleStageClick = useCallback(
    (e: any) => {
      if (isPanningMode) return;

      // In select mode, clicking on empty space deselects
      if (isSelectMode && e.target === e.target.getStage()) {
        setSelectedMeasurement(null);
        return;
      }

      // Don't allow drawing in select mode
      if (isSelectMode) return;

      const stage = e.target.getStage();
      if (!stage) return;

      const pointerPosition = stage.getPointerPosition();
      if (!pointerPosition) return;

      let point = {
        x: (pointerPosition.x - stagePos.x) / stageScale,
        y: (pointerPosition.y - stagePos.y) / stageScale,
      };

      // Validate point values
      if (
        !isFinite(point.x) ||
        !isFinite(point.y) ||
        isNaN(point.x) ||
        isNaN(point.y)
      ) {
        return;
      }

      // Clamp to bounds
      point = {
        x: Math.max(0, Math.min(stageSize.width, point.x)),
        y: Math.max(0, Math.min(stageSize.height, point.y)),
      };

      // Apply advanced snapping
      const snapped = getSnappedPoint(point);
      if (snapped) point = snapped;

      if (calibrationMode) {
        if (!calibrationPoint1) {
          setCalibrationPoint1(point);
        } else {
          let finalPoint = point;
          if (isShiftPressed) {
            finalPoint = getAngleSnappedPoint(point, calibrationPoint1);
          }
          const pixelDist = calculateDistance(calibrationPoint1, finalPoint);
          const dist = parseFloat(calibrationDistance);

          // Validate calibration input
          if (dist <= 0 || !isFinite(dist) || isNaN(dist)) {
            console.warn("Invalid calibration distance");
            return;
          }

          if (pixelDist < MIN_DISTANCE) {
            console.warn("Calibration line is too short");
            return;
          }

          const newScale = pixelDist / dist;

          // Validate scale
          const scaleValidation = validateScale(newScale);
          if (!scaleValidation.isValid) {
            console.warn("Invalid scale:", scaleValidation.error);
            return;
          }

          // Calculate calibration confidence (based on line length - longer lines are more accurate)
          const confidence = Math.min(1.0, pixelDist / 100); // Normalize to 0-1, longer lines = higher confidence

          setScale(currentPage, newScale);
          setCalibrationMode(false);
          setCalibrationPoint1(null);
          setCalibrationLine(currentPage, {
            p1: calibrationPoint1,
            p2: finalPoint,
            distance: dist,
          });

          console.log(
            `Calibration complete: ${newScale.toFixed(2)} px/m (confidence: ${(
              confidence * 100
            ).toFixed(1)}%)`
          );
        }
        return;
      }

      if (!activeItem) return;

      const now = new Date().toISOString();

      if (activeItem.type === "count") {
        const measurement: Measurement = {
          id: Math.random().toString(),
          points: [point],
          quantity: 1,
          page: currentPage,
          metadata: {
            createdAt: now,
            lastModified: now,
            confidence: 1.0, // Count measurements are always confident
          },
        };
        const validation = validateMeasurement(measurement, "count");
        if (validation.isValid) {
          addMeasurement(activeItem.id, measurement);
        } else {
          console.warn("Invalid measurement:", validation.error);
        }
      } else if (activeItem.type === "linear") {
        if (currentPoints.length === 0) {
          setCurrentPoints([point]);
        } else {
          const p1 = currentPoints[0];
          let p2 = point;
          if (isShiftPressed) {
            p2 = getAngleSnappedPoint(point, p1);
          }
          const qty = calculateQuantity([p1, p2], "linear", currentScale);
          // Calculate confidence based on scale and line length
          const lineLength = calculateDistance(p1, p2);
          const confidence = currentScale
            ? Math.min(1.0, lineLength / (currentScale * 10))
            : 0.5;

          const measurement: Measurement = {
            id: Math.random().toString(),
            points: [p1, p2],
            quantity: qty,
            page: currentPage,
            metadata: {
              createdAt: now,
              lastModified: now,
              confidence: Math.max(0.1, confidence),
            },
          };
          const validation = validateMeasurement(measurement, "linear");
          if (validation.isValid) {
            addMeasurement(activeItem.id, measurement);
            setCurrentPoints([]);
          } else {
            console.warn("Invalid measurement:", validation.error);
          }
        }
      } else if (activeItem.type === "area") {
        let finalPoint = point;
        if (currentPoints.length > 0 && isShiftPressed) {
          finalPoint = getAngleSnappedPoint(
            point,
            currentPoints[currentPoints.length - 1]
          );
        }
        setCurrentPoints([...currentPoints, finalPoint]);
      }
    },
    [
      isPanningMode,
      isSelectMode,
      calibrationMode,
      calibrationPoint1,
      calibrationDistance,
      activeItem,
      currentPoints,
      isShiftPressed,
      stagePos,
      stageScale,
      getSnappedPoint,
      getAngleSnappedPoint,
      currentScale,
      currentPage,
      addMeasurement,
      setCalibrationMode,
      setScale,
      setCalibrationLine,
    ]
  );

  // Throttle mouse move for performance
  const mouseMoveThrottleRef = useRef<number | null>(null);
  const lastMouseMoveTimeRef = useRef<number>(0);
  const THROTTLE_MS = 16; // ~60fps

  // Handle mouse move for ghost line (throttled with error handling)
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const processMouseMove = () => {
        try {
          const stage = e.target.getStage();
          if (!stage) return;

          const pointerPosition = stage.getPointerPosition();
          if (!pointerPosition) return;

          let point = {
            x: (pointerPosition.x - stagePos.x) / stageScale,
            y: (pointerPosition.y - stagePos.y) / stageScale,
          };

          // Validate point values
          if (
            !isFinite(point.x) ||
            !isFinite(point.y) ||
            isNaN(point.x) ||
            isNaN(point.y)
          ) {
            return;
          }

          // Clamp to bounds
          point = {
            x: Math.max(0, Math.min(stageSize.width, point.x)),
            y: Math.max(0, Math.min(stageSize.height, point.y)),
          };

          setMousePos(point);

          // Update snapped point
          const snapped = getSnappedPoint(point);
          setSnappedPoint(snapped);
        } catch (error) {
          console.error("Error in handleMouseMove:", error);
        }
      };

      const now = Date.now();
      if (now - lastMouseMoveTimeRef.current < THROTTLE_MS) {
        if (mouseMoveThrottleRef.current) {
          cancelAnimationFrame(mouseMoveThrottleRef.current);
        }
        mouseMoveThrottleRef.current = requestAnimationFrame(processMouseMove);
        return;
      }
      lastMouseMoveTimeRef.current = now;
      processMouseMove();

      try {
        const stage = e.target.getStage();
        if (!stage) return;

        const pointerPosition = stage.getPointerPosition();
        if (!pointerPosition) return;

        let point = {
          x: (pointerPosition.x - stagePos.x) / stageScale,
          y: (pointerPosition.y - stagePos.y) / stageScale,
        };

        // Validate point values
        if (
          !isFinite(point.x) ||
          !isFinite(point.y) ||
          isNaN(point.x) ||
          isNaN(point.y)
        ) {
          return;
        }

        // Clamp to bounds
        point = {
          x: Math.max(0, Math.min(stageSize.width, point.x)),
          y: Math.max(0, Math.min(stageSize.height, point.y)),
        };

        setMousePos(point);

        // Update snapped point
        const snapped = getSnappedPoint(point);
        setSnappedPoint(snapped);
      } catch (error) {
        console.error("Error in handleMouseMove:", error);
      }
    },
    [stagePos, stageScale, getSnappedPoint, stageSize]
  );

  // Handle double click to finish area
  const handleDblClick = useCallback(() => {
    if (activeItem?.type === "area" && currentPoints.length > 2) {
      // Validate measurement before adding
      const area = calculateAreaFromPoints(currentPoints);
      const quantity = isDeductionMode ? -area : area;

      // Calculate confidence based on polygon area and scale
      const pixelArea = calculateArea(currentPoints);
      const confidence = currentScale
        ? Math.min(1.0, pixelArea / (currentScale * currentScale * 100))
        : 0.5;
      const now = new Date().toISOString();

      const measurement: Measurement = {
        id: Math.random().toString(),
        points: [...currentPoints],
        quantity,
        page: currentPage,
        metadata: {
          createdAt: now,
          lastModified: now,
          confidence: Math.max(0.1, confidence),
        },
      };

      const validation = validateMeasurement(measurement, "area");
      if (validation.isValid) {
        addMeasurement(activeItem.id, measurement);
        setCurrentPoints([]);
      } else {
        console.warn("Invalid measurement:", validation.error);
      }
    }
  }, [
    activeItem,
    currentPoints,
    isDeductionMode,
    calculateAreaFromPoints,
    currentPage,
    addMeasurement,
    currentScale,
    calculateArea,
  ]);

  // Handle context menu (right-click) to finish measurement
  const handleContextMenu = useCallback(
    (e: any) => {
      e.evt.preventDefault();
      handleDblClick();
    },
    [handleDblClick]
  );

  // Handle point drag to update measurement
  const handlePointDrag = useCallback(
    (
      itemId: string,
      measurementId: string,
      pointIndex: number,
      newPos: Point
    ) => {
      const item = takeoffItems.find((i) => i.id === itemId);
      if (!item) return;

      const measurement = item.measurements.find((m) => m.id === measurementId);
      if (!measurement) return;

      // Update the point
      let finalPos = newPos;

      // Acrobat-style: Axis-constrained dragging for Linear measurements
      // If holding Shift, constrain point to slide along the line defined by the other point
      if (
        isShiftPressed &&
        item.type === "linear" &&
        measurement.points.length === 2
      ) {
        const otherIdx = pointIndex === 0 ? 1 : 0;
        const otherPoint = measurement.points[otherIdx];
        const currentPoint = measurement.points[pointIndex]; // Current position before drag update

        // Vector of the line
        const dx = currentPoint.x - otherPoint.x;
        const dy = currentPoint.y - otherPoint.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length > 0) {
          // Normalized direction vector
          const ux = dx / length;
          const uy = dy / length;

          // Vector from other point to mouse position
          const vx = newPos.x - otherPoint.x;
          const vy = newPos.y - otherPoint.y;

          // Project v onto u
          const dot = vx * ux + vy * uy;

          // New constrained position
          finalPos = {
            x: otherPoint.x + ux * dot,
            y: otherPoint.y + uy * dot,
          };
        }
      }

      const updatedPoints = [...measurement.points];
      updatedPoints[pointIndex] = finalPos;

      // Recalculate quantity
      let newQuantity = measurement.quantity;
      if (item.type === "linear" && updatedPoints.length === 2) {
        newQuantity = calculateQuantity(updatedPoints, "linear", currentScale);
      } else if (item.type === "area" && updatedPoints.length >= 3) {
        const area = calculateAreaFromPoints(updatedPoints);
        newQuantity = measurement.quantity < 0 ? -area : area; // Preserve deduction
      }

      // Calculate old and new total quantities
      const oldTotal = item.totalQuantity;
      const diff = newQuantity - measurement.quantity;
      const newTotal = oldTotal + diff;

      // Update metadata
      const now = new Date().toISOString();
      const updatedMetadata = {
        ...measurement.metadata,
        lastModified: now,
        createdAt: measurement.metadata?.createdAt || now,
      };

      // Update the item with the new measurement
      const updatedMeasurements = item.measurements.map((m) =>
        m.id === measurementId
          ? {
              ...m,
              points: updatedPoints,
              quantity: newQuantity,
              metadata: updatedMetadata,
            }
          : m
      );

      updateTakeoffItem(itemId, {
        measurements: updatedMeasurements,
        totalQuantity: newTotal,
      });
    },
    [
      takeoffItems,
      currentScale,
      calculateAreaFromPoints,
      updateTakeoffItem,
      isShiftPressed,
    ]
  );

  // Handle measurement group drag to move entire measurement
  const handleMeasurementDrag = useCallback(
    (itemId: string, measurementId: string, dragOffset: Point) => {
      const item = takeoffItems.find((i) => i.id === itemId);
      if (!item) return;

      const measurement = item.measurements.find((m) => m.id === measurementId);
      if (!measurement) return;

      // Move all points by the offset
      const updatedPoints = measurement.points.map((p) => ({
        x: p.x + dragOffset.x,
        y: p.y + dragOffset.y,
      }));

      // Update metadata
      const now = new Date().toISOString();
      const updatedMetadata = {
        ...measurement.metadata,
        lastModified: now,
        createdAt: measurement.metadata?.createdAt || now,
      };

      // Quantity stays the same (we're just moving, not reshaping)
      const updatedMeasurements = item.measurements.map((m) =>
        m.id === measurementId
          ? { ...m, points: updatedPoints, metadata: updatedMetadata }
          : m
      );

      updateTakeoffItem(itemId, {
        measurements: updatedMeasurements,
      });
    },
    [takeoffItems, updateTakeoffItem, isShiftPressed]
  );

  // Handle dragging an entire edge (translating both connected points)
  const handleEdgeDrag = useCallback(
    (
      itemId: string,
      measurementId: string,
      edgeIndex: number,
      delta: Point
    ) => {
      const item = takeoffItems.find((i) => i.id === itemId);
      if (!item) return;

      const measurement = item.measurements.find((m) => m.id === measurementId);
      if (!measurement) return;

      const updatedPoints = [...measurement.points];
      const idx1 = edgeIndex;
      const idx2 = (edgeIndex + 1) % measurement.points.length;

      const p1 = updatedPoints[idx1];
      const p2 = updatedPoints[idx2];

      let effectiveDelta = delta;

      // Acrobat-style: Constrain movement to be perpendicular to the edge (normal vector)
      // unless Shift is pressed for free translation
      if (!isShiftPressed && item.type === "area") {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length > 0) {
          // Normal vector (perpendicular)
          const nx = -dy / length;
          const ny = dx / length;

          // Project delta onto normal
          const dot = delta.x * nx + delta.y * ny;
          effectiveDelta = {
            x: nx * dot,
            y: ny * dot,
          };
        }
      }

      updatedPoints[idx1] = {
        x: p1.x + effectiveDelta.x,
        y: p1.y + effectiveDelta.y,
      };
      updatedPoints[idx2] = {
        x: p2.x + effectiveDelta.x,
        y: p2.y + effectiveDelta.y,
      };

      let newQuantity = 0;
      if (item.type === "linear" && updatedPoints.length === 2) {
        newQuantity = calculateQuantity(updatedPoints, "linear", currentScale);
      } else if (item.type === "area" && updatedPoints.length >= 3) {
        const area = calculateAreaFromPoints(updatedPoints);
        newQuantity = measurement.quantity < 0 ? -area : area;
      }

      const oldTotal = item.totalQuantity;
      const diff = newQuantity - measurement.quantity;
      const newTotal = oldTotal + diff;

      // Update metadata
      const now = new Date().toISOString();
      const updatedMetadata = {
        ...measurement.metadata,
        lastModified: now,
        createdAt: measurement.metadata?.createdAt || now,
      };

      const updatedMeasurements = item.measurements.map((m) =>
        m.id === measurementId
          ? {
              ...m,
              points: updatedPoints,
              quantity: newQuantity,
              metadata: updatedMetadata,
            }
          : m
      );

      updateTakeoffItem(itemId, {
        measurements: updatedMeasurements,
        totalQuantity: newTotal,
      });
    },
    [
      takeoffItems,
      currentScale,
      calculateArea,
      updateTakeoffItem,
      isShiftPressed,
    ]
  );

  // Handle precision nudging with arrow keys
  const handleNudge = useCallback(
    (direction: "up" | "down" | "left" | "right", isLarge: boolean) => {
      if (!selectedMeasurement) return;

      const amount = isLarge ? 10 : 1;
      const delta = {
        x: direction === "left" ? -amount : direction === "right" ? amount : 0,
        y: direction === "up" ? -amount : direction === "down" ? amount : 0,
      };

      if (hoveredPoint) {
        const { itemId, measurementId, pointIndex } = hoveredPoint;
        const item = takeoffItems.find((i) => i.id === itemId);
        const measurement = item?.measurements.find(
          (m) => m.id === measurementId
        );
        if (measurement) {
          const newPos = {
            x: measurement.points[pointIndex].x + delta.x,
            y: measurement.points[pointIndex].y + delta.y,
          };
          handlePointDrag(itemId, measurementId, pointIndex, newPos);
        }
      } else if (hoveredEdge) {
        const { itemId, measurementId, edgeIndex } = hoveredEdge;
        handleEdgeDrag(itemId, measurementId, edgeIndex, delta);
      } else {
        handleMeasurementDrag(
          selectedMeasurement.itemId,
          selectedMeasurement.measurementId,
          delta
        );
      }
    },
    [
      selectedMeasurement,
      hoveredPoint,
      hoveredEdge,
      takeoffItems,
      handlePointDrag,
      handleEdgeDrag,
      handleMeasurementDrag,
    ]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCurrentPoints([]);
        setCalibrationMode(false);
        setCalibrationPoint1(null);
      }
      if (e.key === "Shift") setIsShiftPressed(true);
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (currentPoints.length > 0) {
          // If drawing, undo last point
          setCurrentPoints((prev) => prev.slice(0, -1));
        } else if (canUndo) {
          // Otherwise, undo last command
          undo();
        }
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        if (canRedo) {
          redo();
        }
      }
      if (e.key.toLowerCase() === "m") {
        setIsPanningMode((p) => !p);
      }
      if (e.key.toLowerCase() === "v") {
        setIsSelectMode((p) => !p);
      }
      if (e.key.toLowerCase() === "x") {
        setIsDeductionMode((p) => !p);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedMeasurement) {
          e.preventDefault();
          removeMeasurement(
            selectedMeasurement.itemId,
            selectedMeasurement.measurementId
          );
          setSelectedMeasurement(null);
        }
      }

      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const direction = e.key.replace("Arrow", "").toLowerCase() as
          | "up"
          | "down"
          | "left"
          | "right";
        handleNudge(direction, e.shiftKey);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setIsShiftPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    currentPoints,
    selectedMeasurement,
    removeMeasurement,
    setCalibrationMode,
    handleNudge,
    undo,
    redo,
    canUndo,
    canRedo,
  ]);

  // Handle zoom
  const handleWheel = useCallback(
    (e: any) => {
      e.evt.preventDefault();
      const scaleBy = 1.05;
      const stage = e.target.getStage();
      const oldScale = stageScale;
      const pointer = stage.getPointerPosition();

      const newScale =
        e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
      const clampedScale = Math.max(0.1, Math.min(5, newScale));

      // Zoom to cursor position
      const mousePointTo = {
        x: (pointer.x - stagePos.x) / oldScale,
        y: (pointer.y - stagePos.y) / oldScale,
      };

      const newPos = {
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      };

      setStageScale(clampedScale);
      setStagePos(newPos);
    },
    [stageScale, stagePos]
  );

  // Update cursor dynamically
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;

    let cursor = "default";
    if (isPanningMode) cursor = "move";
    else if (isSelectMode) cursor = "pointer";
    else if (calibrationMode || activeItem) cursor = "crosshair";

    container.style.cursor = cursor;
  }, [isPanningMode, isSelectMode, calibrationMode, activeItem]);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Toolbar */}
      <div className="p-3 bg-white border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition">
            <FileUp className="w-5 h-5" />
            <span>Upload Plan</span>
            <input
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              onChange={handleFileUpload}
            />
          </label>

          <div className="h-8 w-px bg-gray-200" />

          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => {
                const newMode = !calibrationMode;
                setCalibrationMode(newMode);
                setCalibrationPoint1(null);
                if (newMode) {
                  setIsPanningMode(false);
                  setIsSelectMode(false);
                }
              }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
                calibrationMode
                  ? "bg-red-500 text-white animate-pulse"
                  : currentScale
                  ? "bg-green-100 text-green-700 border border-green-200"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {currentScale ? (
                <Check className="w-5 h-5" />
              ) : (
                <Ruler className="w-5 h-5" />
              )}
              <span>
                {calibrationMode
                  ? "Calibrating..."
                  : currentScale
                  ? "Calibrated"
                  : "Calibrate"}
              </span>
            </button>
            {calibrationMode && (
              <input
                type="text"
                placeholder="Length (m)"
                value={calibrationDistance}
                onChange={(e) => setCalibrationDistance(e.target.value)}
                className="ml-2 px-3 py-1 border rounded text-sm w-32 outline-none focus:ring-2 focus:ring-red-300"
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              const newMode = !isPanningMode;
              setIsPanningMode(newMode);
              if (newMode) {
                setIsSelectMode(false);
                setCalibrationMode(false);
              }
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
              isPanningMode
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            title="Pan Tool (M)"
          >
            <Move className="w-5 h-5" />
            <span>Pan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const newMode = !isSelectMode;
              setIsSelectMode(newMode);
              if (newMode) {
                setIsPanningMode(false);
                setCalibrationMode(false);
              }
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
              isSelectMode
                ? "bg-purple-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            title="Select/Edit Mode (V)"
          >
            <MousePointer2 className="w-5 h-5" />
            <span>Select</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDeductionMode(!isDeductionMode)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
              isDeductionMode
                ? "bg-red-500 text-white animate-pulse"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            title="Deduct Mode (X)"
          >
            <Scissors className="w-5 h-5" />
            <span>Deduct</span>
          </button>
        </div>

        <div className="flex items-center space-x-4">
          <SaveIndicator />

          <div className="h-8 w-px bg-gray-200" />

          <button
            onClick={() =>
              setCurrentPoints((prev) =>
                prev.length > 0 ? prev.slice(0, -1) : []
              )
            }
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => {
              if (confirm("Clear all measurements?")) {
                /* Reset */
              }
            }}
            className="p-2 hover:bg-red-50 rounded-lg transition"
            title="Clear All"
          >
            <RotateCcw className="w-5 h-5 text-red-500" />
          </button>
        </div>
      </div>

      <div
        id="canvas-container"
        ref={containerRef}
        className="flex-1 bg-gray-200 relative overflow-auto"
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          draggable={isPanningMode && !isDraggingObject}
          onClick={handleStageClick}
          onDblClick={handleDblClick}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          onDragEnd={(e) => {
            if (e.target === e.target.getStage()) {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }
          }}
        >
          <Layer>
            {/* White background */}
            <Rect
              x={0}
              y={0}
              width={stageSize.width}
              height={stageSize.height}
              fill="white"
            />
            {image && (
              <KonvaImage
                image={image}
                scaleX={imageScale}
                scaleY={imageScale}
              />
            )}

            {/* Render takeoff items */}
            {takeoffItems.map((item) =>
              item.measurements
                .filter((m) => m.page === currentPage)
                .map((m) => {
                  if (item.type === "linear" && m.points.length === 2) {
                    let displayPoints = m.points;
                    const dragging = activeDragPoint;
                    if (
                      dragging?.itemId === item.id &&
                      dragging?.measurementId === m.id
                    ) {
                      displayPoints = displayPoints.map((p, i) =>
                        i === dragging.pointIndex ? dragging.pos : p
                      );
                    }
                    const p1 = displayPoints[0];
                    const p2 = displayPoints[1];
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const angle = Math.atan2(dy, dx);
                    const tickLen = 6;
                    const tickDX = Math.sin(angle) * tickLen;
                    const tickDY = Math.cos(angle) * tickLen;
                    const isSelected =
                      selectedMeasurement?.itemId === item.id &&
                      selectedMeasurement?.measurementId === m.id;
                    const isHovered =
                      hoveredMeasurement?.itemId === item.id &&
                      hoveredMeasurement?.measurementId === m.id;

                    const currentQty = calculateQuantity(
                      displayPoints,
                      "linear",
                      currentScale
                    );

                    return (
                      <Group
                        key={m.id}
                        draggable={isSelectMode}
                        onDragStart={() => setIsDraggingObject(true)}
                        ref={(node) => {
                          if (isSelected && node) {
                            selectedShapeRef.current = node;
                          }
                        }}
                        onDragEnd={(e) => {
                          if (!isSelectMode) return;
                          const offset = {
                            x: e.target.x(),
                            y: e.target.y(),
                          };
                          handleMeasurementDrag(item.id, m.id, offset);
                          setIsDraggingObject(false);
                          e.target.position({ x: 0, y: 0 });
                        }}
                        onClick={(e) => {
                          if (!isSelectMode) return;
                          e.cancelBubble = true;
                          setSelectedMeasurement({
                            itemId: item.id,
                            measurementId: m.id,
                          });
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelectMode) return;
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "move";
                          setHoveredMeasurement({
                            itemId: item.id,
                            measurementId: m.id,
                          });
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelectMode) return;
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "pointer";
                          setHoveredMeasurement(null);
                        }}
                      >
                        {/* Selection highlight */}
                        {isSelected && (
                          <Line
                            points={[p1.x, p1.y, p2.x, p2.y]}
                            stroke={item.color}
                            strokeWidth={12}
                            opacity={0.3}
                            listening={false}
                          />
                        )}
                        {/* Main line */}
                        <Line
                          points={[p1.x, p1.y, p2.x, p2.y]}
                          stroke={item.color}
                          strokeWidth={isSelected || isHovered ? 4 : 2}
                          opacity={isHovered ? 0.7 : 1}
                        />
                        {/* Perpendicular ticks */}
                        <Line
                          points={[
                            p1.x - tickDX,
                            p1.y + tickDY,
                            p1.x + tickDX,
                            p1.y - tickDY,
                          ]}
                          stroke={item.color}
                          strokeWidth={isSelected || isHovered ? 4 : 2}
                        />
                        <Line
                          points={[
                            p2.x - tickDX,
                            p2.y + tickDY,
                            p2.x + tickDX,
                            p2.y - tickDY,
                          ]}
                          stroke={item.color}
                          strokeWidth={isSelected || isHovered ? 4 : 2}
                        />
                        {/* Dimension label */}
                        <Text
                          x={(p1.x + p2.x) / 2}
                          y={(p1.y + p2.y) / 2 - 15}
                          text={formatDistance(currentQty)}
                          fontSize={12}
                          fill={item.color}
                          rotation={angle * (180 / Math.PI)}
                          offsetX={formatDistance(currentQty).length * 3}
                          offsetY={6}
                        />

                        {/* Edge hit area for dragging entire segment */}
                        {isSelected && (
                          <Line
                            points={[p1.x, p1.y, p2.x, p2.y]}
                            stroke="transparent"
                            strokeWidth={15}
                            draggable={true}
                            onDragStart={(e) => {
                              e.cancelBubble = true;
                              setIsDraggingObject(true);
                            }}
                            onDragMove={(e) => {
                              const delta = {
                                x: e.target.x(),
                                y: e.target.y(),
                              };
                              handleEdgeDrag(item.id, m.id, 0, delta);
                              e.target.position({ x: 0, y: 0 });
                            }}
                            onDragEnd={() => setIsDraggingObject(false)}
                            onMouseEnter={(e) => {
                              setHoveredEdge({
                                itemId: item.id,
                                measurementId: m.id,
                                edgeIndex: 0,
                              });
                              const container = e.target
                                .getStage()
                                ?.container();
                              if (container) container.style.cursor = "move";
                            }}
                            onMouseLeave={(e) => {
                              setHoveredEdge(null);
                              const container = e.target
                                .getStage()
                                ?.container();
                              if (container) container.style.cursor = "pointer";
                            }}
                          />
                        )}

                        {/* Edge hover highlight */}
                        {hoveredEdge?.itemId === item.id &&
                          hoveredEdge?.measurementId === m.id &&
                          hoveredEdge?.edgeIndex === 0 && (
                            <Line
                              points={[p1.x, p1.y, p2.x, p2.y]}
                              stroke={item.color}
                              strokeWidth={6}
                              opacity={0.5}
                              listening={false}
                            />
                          )}

                        {/* Endpoint handles - always visible for easy adjustment */}
                        {isSelected && (
                          <>
                            {/* Start point handle */}
                            <Circle
                              x={p1.x}
                              y={p1.y}
                              radius={
                                hoveredPoint?.itemId === item.id &&
                                hoveredPoint?.measurementId === m.id &&
                                hoveredPoint?.pointIndex === 0
                                  ? 10
                                  : 8
                              }
                              fill={
                                hoveredPoint?.itemId === item.id &&
                                hoveredPoint?.measurementId === m.id &&
                                hoveredPoint?.pointIndex === 0
                                  ? item.color
                                  : "white"
                              }
                              stroke={item.color}
                              strokeWidth={3}
                              draggable={true}
                              onDragStart={(e) => {
                                e.cancelBubble = true;
                                setIsDraggingObject(true);
                                setActiveDragPoint({
                                  itemId: item.id,
                                  measurementId: m.id,
                                  pointIndex: 0,
                                  pos: p1,
                                });
                                const container = e.target
                                  .getStage()
                                  ?.container();
                                if (container)
                                  container.style.cursor = "grabbing";
                              }}
                              onDragMove={(e) => {
                                const pos = e.target.position();
                                setActiveDragPoint({
                                  itemId: item.id,
                                  measurementId: m.id,
                                  pointIndex: 0,
                                  pos,
                                });
                              }}
                              onDragEnd={(e) => {
                                setIsDraggingObject(false);
                                setActiveDragPoint(null);
                                const pos = e.target.position();
                                handlePointDrag(item.id, m.id, 0, pos);
                              }}
                              onClick={(e) => {
                                e.cancelBubble = true;
                                setSelectedMeasurement({
                                  itemId: item.id,
                                  measurementId: m.id,
                                });
                              }}
                              onMouseEnter={(e) => {
                                setHoveredPoint({
                                  itemId: item.id,
                                  measurementId: m.id,
                                  pointIndex: 0,
                                });
                                const container = e.target
                                  .getStage()
                                  ?.container();
                                if (container) container.style.cursor = "grab";
                              }}
                              onMouseLeave={(e) => {
                                setHoveredPoint(null);
                                const container = e.target
                                  .getStage()
                                  ?.container();
                                if (container)
                                  container.style.cursor = "pointer";
                              }}
                              shadowColor={item.color}
                              shadowBlur={
                                hoveredPoint?.itemId === item.id &&
                                hoveredPoint?.measurementId === m.id &&
                                hoveredPoint?.pointIndex === 0
                                  ? 8
                                  : 0
                              }
                              shadowOpacity={0.4}
                            />
                            {/* End point handle */}
                            <Circle
                              x={p2.x}
                              y={p2.y}
                              radius={
                                hoveredPoint?.itemId === item.id &&
                                hoveredPoint?.measurementId === m.id &&
                                hoveredPoint?.pointIndex === 1
                                  ? 10
                                  : 8
                              }
                              fill={
                                hoveredPoint?.itemId === item.id &&
                                hoveredPoint?.measurementId === m.id &&
                                hoveredPoint?.pointIndex === 1
                                  ? item.color
                                  : "white"
                              }
                              stroke={item.color}
                              strokeWidth={3}
                              draggable={true}
                              onDragStart={(e) => {
                                e.cancelBubble = true;
                                setIsDraggingObject(true);
                                setActiveDragPoint({
                                  itemId: item.id,
                                  measurementId: m.id,
                                  pointIndex: 1,
                                  pos: p2,
                                });
                                const container = e.target
                                  .getStage()
                                  ?.container();
                                if (container)
                                  container.style.cursor = "grabbing";
                              }}
                              onDragMove={(e) => {
                                const pos = e.target.position();
                                setActiveDragPoint({
                                  itemId: item.id,
                                  measurementId: m.id,
                                  pointIndex: 1,
                                  pos,
                                });
                              }}
                              onDragEnd={(e) => {
                                setIsDraggingObject(false);
                                setActiveDragPoint(null);
                                const pos = e.target.position();
                                handlePointDrag(item.id, m.id, 1, pos);
                              }}
                              onClick={(e) => {
                                e.cancelBubble = true;
                                setSelectedMeasurement({
                                  itemId: item.id,
                                  measurementId: m.id,
                                });
                              }}
                              onMouseEnter={(e) => {
                                setHoveredPoint({
                                  itemId: item.id,
                                  measurementId: m.id,
                                  pointIndex: 1,
                                });
                                const container = e.target
                                  .getStage()
                                  ?.container();
                                if (container) container.style.cursor = "grab";
                              }}
                              onMouseLeave={(e) => {
                                setHoveredPoint(null);
                                const container = e.target
                                  .getStage()
                                  ?.container();
                                if (container)
                                  container.style.cursor = "pointer";
                              }}
                              shadowColor={item.color}
                              shadowBlur={
                                hoveredPoint?.itemId === item.id &&
                                hoveredPoint?.measurementId === m.id &&
                                hoveredPoint?.pointIndex === 1
                                  ? 8
                                  : 0
                              }
                              shadowOpacity={0.4}
                            />
                          </>
                        )}
                      </Group>
                    );
                  } else if (item.type === "area") {
                    let displayPoints = m.points;
                    const dragging = activeDragPoint;
                    if (
                      dragging?.itemId === item.id &&
                      dragging?.measurementId === m.id
                    ) {
                      displayPoints = displayPoints.map((p, i) =>
                        i === dragging.pointIndex ? dragging.pos : p
                      );
                    }
                    const center = displayPoints.reduce(
                      (acc, p) => ({
                        x: acc.x + p.x / displayPoints.length,
                        y: acc.y + p.y / displayPoints.length,
                      }),
                      { x: 0, y: 0 }
                    );
                    const isSelected =
                      selectedMeasurement?.itemId === item.id &&
                      selectedMeasurement?.measurementId === m.id;
                    const isHovered =
                      hoveredMeasurement?.itemId === item.id &&
                      hoveredMeasurement?.measurementId === m.id;

                    return (
                      <Group
                        key={m.id}
                        draggable={isSelectMode}
                        onDragStart={() => setIsDraggingObject(true)}
                        ref={(node) => {
                          if (isSelected && node) {
                            selectedShapeRef.current = node;
                          }
                        }}
                        onDragEnd={(e) => {
                          if (!isSelectMode) return;
                          const offset = {
                            x: e.target.x(),
                            y: e.target.y(),
                          };
                          handleMeasurementDrag(item.id, m.id, offset);
                          setIsDraggingObject(false);
                          e.target.position({ x: 0, y: 0 });
                        }}
                        onClick={(e) => {
                          if (!isSelectMode) return;
                          e.cancelBubble = true;
                          setSelectedMeasurement({
                            itemId: item.id,
                            measurementId: m.id,
                          });
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelectMode) return;
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "move";
                          setHoveredMeasurement({
                            itemId: item.id,
                            measurementId: m.id,
                          });
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelectMode) return;
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "pointer";
                          setHoveredMeasurement(null);
                        }}
                      >
                        <Line
                          points={displayPoints.flatMap((p) => [p.x, p.y])}
                          stroke={item.color}
                          strokeWidth={isSelected || isHovered ? 4 : 2}
                          fill={
                            m.quantity < 0
                              ? "rgba(255,255,255,0.5)"
                              : item.color + "44"
                          }
                          dash={m.quantity < 0 ? [5, 5] : undefined}
                          opacity={isHovered ? 0.8 : 1}
                          closed
                        />
                        {/* Selection highlight */}
                        {isSelected && (
                          <Line
                            points={displayPoints.flatMap((p) => [p.x, p.y])}
                            stroke={item.color}
                            strokeWidth={8}
                            opacity={0.3}
                            closed
                            listening={false}
                          />
                        )}
                        <Text
                          x={center.x}
                          y={center.y}
                          text={formatArea(m.quantity)}
                          fontSize={14}
                          fontStyle="bold"
                          fill={m.quantity < 0 ? "#ff0000" : item.color}
                          offsetX={formatArea(m.quantity).length * 3.5}
                          offsetY={7}
                        />

                        {/* Edge hit areas for dragging segments */}
                        {isSelected &&
                          m.points.map((p, i) => {
                            const p1 = p;
                            const p2 = m.points[(i + 1) % m.points.length];
                            const isEdgeHovered =
                              hoveredEdge?.itemId === item.id &&
                              hoveredEdge?.measurementId === m.id &&
                              hoveredEdge?.edgeIndex === i;

                            return (
                              <Group key={`edge-hit-area-${i}`}>
                                <Line
                                  points={[p1.x, p1.y, p2.x, p2.y]}
                                  stroke="transparent"
                                  strokeWidth={15}
                                  draggable={true}
                                  onDragStart={() => setIsDraggingObject(true)}
                                  onDragMove={(e) => {
                                    const delta = {
                                      x: e.target.x(),
                                      y: e.target.y(),
                                    };
                                    handleEdgeDrag(item.id, m.id, i, delta);
                                    e.target.position({ x: 0, y: 0 });
                                  }}
                                  onDragEnd={() => setIsDraggingObject(false)}
                                  onMouseEnter={(e) => {
                                    setHoveredEdge({
                                      itemId: item.id,
                                      measurementId: m.id,
                                      edgeIndex: i,
                                    });
                                    const container = e.target
                                      .getStage()
                                      ?.container();
                                    if (container)
                                      container.style.cursor = "move";
                                  }}
                                  onMouseLeave={(e) => {
                                    setHoveredEdge(null);
                                    const container = e.target
                                      .getStage()
                                      ?.container();
                                    if (container)
                                      container.style.cursor = "pointer";
                                  }}
                                />
                                {isEdgeHovered && (
                                  <Line
                                    points={[p1.x, p1.y, p2.x, p2.y]}
                                    stroke={item.color}
                                    strokeWidth={6}
                                    opacity={0.5}
                                    listening={false}
                                  />
                                )}
                              </Group>
                            );
                          })}
                      </Group>
                    );
                  } else if (item.type === "count") {
                    const isSelected =
                      selectedMeasurement?.itemId === item.id &&
                      selectedMeasurement?.measurementId === m.id;

                    return m.points.map((p, idx) => {
                      const isHovered =
                        hoveredMeasurement?.itemId === item.id &&
                        hoveredMeasurement?.measurementId === m.id;

                      return (
                        <Circle
                          key={`${m.id}-${idx}`}
                          x={p.x}
                          y={p.y}
                          radius={isSelected || isHovered ? 8 : 6}
                          fill={item.color}
                          stroke="white"
                          strokeWidth={isSelected || isHovered ? 3 : 2}
                          draggable={isSelectMode}
                          onDragStart={() => setIsDraggingObject(true)}
                          onDragMove={(e) => {
                            if (!isSelectMode) return;
                            const newPos = e.target.position();
                            handlePointDrag(item.id, m.id, idx, {
                              x: newPos.x,
                              y: newPos.y,
                            });
                          }}
                          onDragEnd={() => {
                            setIsDraggingObject(false);
                          }}
                          onClick={(e) => {
                            if (!isSelectMode) return;
                            e.cancelBubble = true;
                            setSelectedMeasurement({
                              itemId: item.id,
                              measurementId: m.id,
                            });
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelectMode) return;
                            const container = e.target.getStage()?.container();
                            if (container) container.style.cursor = "move";
                            setHoveredMeasurement({
                              itemId: item.id,
                              measurementId: m.id,
                            });
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelectMode) return;
                            const container = e.target.getStage()?.container();
                            if (container) container.style.cursor = "pointer";
                            setHoveredMeasurement(null);
                          }}
                        />
                      );
                    });
                  }
                  return null;
                })
            )}

            {/* Draggable points in select mode */}
            {isSelectMode &&
              takeoffItems.map((item) =>
                item.measurements
                  .filter((m) => m.page === currentPage)
                  .flatMap((m) => {
                    const isSelected =
                      selectedMeasurement?.itemId === item.id &&
                      selectedMeasurement?.measurementId === m.id;
                    return m.points.map((p, idx) => {
                      const isHovered =
                        hoveredPoint?.itemId === item.id &&
                        hoveredPoint?.measurementId === m.id &&
                        hoveredPoint?.pointIndex === idx;
                      return (
                        <Circle
                          key={`${m.id}-point-${idx}`}
                          x={p.x}
                          y={p.y}
                          radius={isSelected ? 10 : isHovered ? 8 : 6}
                          fill={
                            isSelected
                              ? item.color
                              : isHovered
                              ? item.color
                              : "white"
                          }
                          stroke={item.color}
                          strokeWidth={isSelected || isHovered ? 3 : 2}
                          draggable={true}
                          onDragStart={(e) => {
                            e.cancelBubble = true;
                            setIsDraggingObject(true);
                            setActiveDragPoint({
                              itemId: item.id,
                              measurementId: m.id,
                              pointIndex: idx,
                              pos: p,
                            });
                            const container = e.target.getStage()?.container();
                            if (container) {
                              container.style.cursor = "grabbing";
                            }
                          }}
                          onDragMove={(e) => {
                            const pos = e.target.position();
                            setActiveDragPoint({
                              itemId: item.id,
                              measurementId: m.id,
                              pointIndex: idx,
                              pos,
                            });
                          }}
                          onDragEnd={(e) => {
                            setIsDraggingObject(false);
                            setActiveDragPoint(null);
                            const pos = e.target.position();
                            handlePointDrag(item.id, m.id, idx, pos);
                          }}
                          onClick={(e) => {
                            e.cancelBubble = true;
                            setSelectedMeasurement({
                              itemId: item.id,
                              measurementId: m.id,
                            });
                          }}
                          onMouseEnter={(e) => {
                            const container = e.target.getStage()?.container();
                            if (container) {
                              container.style.cursor = "grab";
                            }
                            setHoveredPoint({
                              itemId: item.id,
                              measurementId: m.id,
                              pointIndex: idx,
                            });
                          }}
                          onMouseLeave={(e) => {
                            const container = e.target.getStage()?.container();
                            if (container) {
                              container.style.cursor = "pointer";
                            }
                            setHoveredPoint(null);
                          }}
                          shadowColor={isSelected ? item.color : undefined}
                          shadowBlur={isSelected ? 10 : 0}
                          shadowOpacity={isSelected ? 0.5 : 0}
                        />
                      );
                    });
                  })
              )}

            {/* Edge midpoint handles in select mode (for area measurements) */}
            {isSelectMode &&
              takeoffItems.map((item) =>
                item.measurements
                  .filter((m) => m.page === currentPage)
                  .filter((m) => item.type === "area" && m.points.length >= 3)
                  .flatMap((m) => {
                    const isSelected =
                      selectedMeasurement?.itemId === item.id &&
                      selectedMeasurement?.measurementId === m.id;
                    if (!isSelected) return [];

                    const midpoints = getEdgeMidpoints(m.points);
                    return midpoints.map((midpoint, edgeIdx) => {
                      const isHovered =
                        hoveredEdge?.itemId === item.id &&
                        hoveredEdge?.measurementId === m.id &&
                        hoveredEdge?.edgeIndex === edgeIdx;
                      return (
                        <Circle
                          key={`${m.id}-edge-${edgeIdx}`}
                          x={midpoint.x}
                          y={midpoint.y}
                          radius={isHovered ? 7 : 5}
                          fill="white"
                          stroke={item.color}
                          strokeWidth={2}
                          opacity={isHovered ? 1 : 0.7}
                          draggable={true}
                          onDragStart={(e) => {
                            setIsDraggingObject(true);
                            const container = e.target.getStage()?.container();
                            if (container) {
                              container.style.cursor = "grabbing";
                            }
                          }}
                          onDragMove={(e) => {
                            const pos = e.target.position();
                            handleEdgeMidpointDrag(item.id, m.id, edgeIdx, {
                              x: pos.x,
                              y: pos.y,
                            });
                          }}
                          onDragEnd={(e) => {
                            setIsDraggingObject(false);
                            e.target.position(midpoint);
                          }}
                          onClick={(e) => {
                            e.cancelBubble = true;
                          }}
                          onMouseEnter={(e) => {
                            const container = e.target.getStage()?.container();
                            if (container) {
                              container.style.cursor = "cell";
                            }
                            setHoveredEdge({
                              itemId: item.id,
                              measurementId: m.id,
                              edgeIndex: edgeIdx,
                            });
                          }}
                          onMouseLeave={(e) => {
                            const container = e.target.getStage()?.container();
                            if (container) {
                              container.style.cursor = "pointer";
                            }
                            setHoveredEdge(null);
                          }}
                        />
                      );
                    });
                  })
              )}

            {/* Render current drawing points */}
            {currentPoints.length > 0 && activeItem && (
              <>
                {currentPoints.map((p, i) => {
                  const tickLen = 8;
                  return (
                    <Group key={i}>
                      {/* Horizontal tick mark instead of circle */}
                      <Line
                        points={[p.x - tickLen, p.y, p.x + tickLen, p.y]}
                        stroke={activeItem.color}
                        strokeWidth={3}
                      />
                      {/* Small center dot */}
                      <Circle
                        x={p.x}
                        y={p.y}
                        radius={2}
                        fill={activeItem.color}
                      />
                    </Group>
                  );
                })}
                {currentPoints.length > 1 && (
                  <Line
                    points={currentPoints.flatMap((p) => [p.x, p.y])}
                    stroke={activeItem.color}
                    strokeWidth={2}
                    dash={[5, 5]}
                  />
                )}
              </>
            )}

            {/* Ghost line preview */}
            {mousePos &&
              currentPoints.length > 0 &&
              activeItem &&
              !isPanningMode && (
                <>
                  {(activeItem.type === "linear" ||
                    activeItem.type === "area") &&
                    (() => {
                      const lastPoint = currentPoints[currentPoints.length - 1];
                      let previewPoint = mousePos;

                      // Apply snapping
                      const snapped = getSnappedPoint(mousePos);
                      if (snapped) previewPoint = snapped;
                      else if (isShiftPressed)
                        previewPoint = getAngleSnappedPoint(
                          mousePos,
                          lastPoint
                        );

                      const dx = previewPoint.x - lastPoint.x;
                      const dy = previewPoint.y - lastPoint.y;
                      const angle = Math.atan2(dy, dx);
                      const qty = calculateQuantity(
                        [lastPoint, previewPoint],
                        "linear",
                        currentScale
                      );
                      const tickLen = 6;
                      const tickDX = Math.sin(angle) * tickLen;
                      const tickDY = Math.cos(angle) * tickLen;

                      return (
                        <Group opacity={0.5}>
                          <Line
                            points={[
                              lastPoint.x,
                              lastPoint.y,
                              previewPoint.x,
                              previewPoint.y,
                            ]}
                            stroke={activeItem.color}
                            strokeWidth={2}
                            dash={[5, 5]}
                          />
                          {activeItem.type === "area" &&
                            currentPoints.length > 1 && (
                              <Line
                                points={[
                                  previewPoint.x,
                                  previewPoint.y,
                                  currentPoints[0].x,
                                  currentPoints[0].y,
                                ]}
                                stroke={activeItem.color}
                                strokeWidth={1}
                                dash={[2, 2]}
                              />
                            )}
                          <Line
                            points={[
                              lastPoint.x - tickDX,
                              lastPoint.y + tickDY,
                              lastPoint.x + tickDX,
                              lastPoint.y - tickDY,
                            ]}
                            stroke={activeItem.color}
                            strokeWidth={2}
                          />
                          <Line
                            points={[
                              previewPoint.x - tickDX,
                              previewPoint.y + tickDY,
                              previewPoint.x + tickDX,
                              previewPoint.y - tickDY,
                            ]}
                            stroke={activeItem.color}
                            strokeWidth={2}
                          />
                          <Text
                            x={(lastPoint.x + previewPoint.x) / 2}
                            y={(lastPoint.y + previewPoint.y) / 2 - 15}
                            text={formatDistance(qty)}
                            fontSize={12}
                            fill={activeItem.color}
                            rotation={angle * (180 / Math.PI)}
                            offsetX={formatDistance(qty).length * 3}
                            offsetY={6}
                          />
                        </Group>
                      );
                    })()}
                </>
              )}

            {/* Calibration ghost line */}
            {calibrationMode &&
              calibrationPoint1 &&
              mousePos &&
              (() => {
                let previewPoint = mousePos;
                if (isShiftPressed)
                  previewPoint = getAngleSnappedPoint(
                    mousePos,
                    calibrationPoint1
                  );

                const dx = previewPoint.x - calibrationPoint1.x;
                const dy = previewPoint.y - calibrationPoint1.y;
                const angle = Math.atan2(dy, dx);
                const tickLen = 6;
                const tickDX = Math.sin(angle) * tickLen;
                const tickDY = Math.cos(angle) * tickLen;

                return (
                  <Group opacity={0.7}>
                    <Line
                      points={[
                        calibrationPoint1.x,
                        calibrationPoint1.y,
                        previewPoint.x,
                        previewPoint.y,
                      ]}
                      stroke="red"
                      strokeWidth={2}
                      dash={[5, 5]}
                    />
                    <Line
                      points={[
                        calibrationPoint1.x - tickDX,
                        calibrationPoint1.y + tickDY,
                        calibrationPoint1.x + tickDX,
                        calibrationPoint1.y - tickDY,
                      ]}
                      stroke="red"
                      strokeWidth={2}
                    />
                    <Line
                      points={[
                        previewPoint.x - tickDX,
                        previewPoint.y + tickDY,
                        previewPoint.x + tickDX,
                        previewPoint.y - tickDY,
                      ]}
                      stroke="red"
                      strokeWidth={2}
                    />
                  </Group>
                );
              })()}

            {/* Render calibration point */}
            {calibrationPoint1 && (
              <Group>
                {/* Horizontal tick mark */}
                <Line
                  points={[
                    calibrationPoint1.x - 8,
                    calibrationPoint1.y,
                    calibrationPoint1.x + 8,
                    calibrationPoint1.y,
                  ]}
                  stroke="red"
                  strokeWidth={3}
                />
                {/* Small center dot */}
                <Circle
                  x={calibrationPoint1.x}
                  y={calibrationPoint1.y}
                  radius={2}
                  fill="red"
                />
              </Group>
            )}

            {/* Snapped vertex indicator */}
            {snappedPoint && !isPanningMode && (
              <>
                <Circle
                  x={snappedPoint.x}
                  y={snappedPoint.y}
                  radius={12}
                  stroke="#FF6B00"
                  strokeWidth={3}
                  fill="rgba(255, 107, 0, 0.2)"
                />
                <Circle
                  x={snappedPoint.x}
                  y={snappedPoint.y}
                  radius={4}
                  fill="#FF6B00"
                />
              </>
            )}
          </Layer>
        </Stage>

        {/* Zoom controls */}
        <div className="absolute bottom-6 right-6 flex items-center space-x-2 bg-white/80 backdrop-blur p-2 rounded-xl shadow-xl border border-white/50">
          <button
            onClick={() => {
              const newScale = Math.min(5, stageScale * 1.1);
              setStageScale(newScale);
            }}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              const newScale = Math.max(0.1, stageScale / 1.1);
              setStageScale(newScale);
            }}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
        </div>

        {/* PDF page navigation */}
        {pdfDoc && numPages > 0 && (
          <div className="absolute bottom-6 left-6 flex items-center space-x-4 bg-white/80 backdrop-blur p-2 rounded-xl shadow-xl border border-white/50">
            <button
              onClick={() => changePage(-1)}
              disabled={currentPage === 1}
              className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-gray-500 uppercase font-bold">
                Page
              </span>
              <span className="text-sm font-bold">
                {currentPage} / {numPages}
              </span>
            </div>
            <button
              onClick={() => changePage(1)}
              disabled={currentPage === numPages}
              className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="h-8 w-px bg-gray-200" />
            <div
              className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-bold ${
                currentScale
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {currentScale ? (
                <Check className="w-3 h-3" />
              ) : (
                <AlertCircle className="w-3 h-3" />
              )}
              <span>
                {currentScale
                  ? `CALIBRATED (1m = ${currentScale.toFixed(1)}px)`
                  : "UNSCALED"}
              </span>
            </div>
          </div>
        )}

        {/* Mode indicators */}
        {isSelectMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-4 py-2 rounded-full shadow-lg z-20 text-xs font-bold uppercase tracking-widest border-2 border-white">
            Select Mode Active - Drag Points (large) or Edges (small)
          </div>
        )}

        {isDeductionMode && !isSelectMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg z-20 text-xs font-bold uppercase tracking-widest animate-pulse border-2 border-white">
            Deduction Mode Active
          </div>
        )}

        {isShiftPressed && !isSelectMode && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-blue-600/80 backdrop-blur text-white px-4 py-2 rounded-full shadow-lg z-20 text-xs font-bold uppercase tracking-widest">
            Precision Mode Active (Snapped)
          </div>
        )}
      </div>
    </div>
  );
};

export default FloorPlanCanvas;
