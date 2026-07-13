import React, { useRef, useEffect, useCallback, useState, useMemo } from "react";
import type { TakeoffItem, TakeoffMode } from "@/types/takeoff";
import {
  Line,
  Circle,
  Text,
  Group,
} from "react-konva";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import type { Point, Measurement } from "@/types/takeoff";
import "@/utils/planMediaLoader";
import type Konva from "konva";
import {
  calculateDistance,
  calculateArea,
  calculateQuantity,
  validateMeasurement,
  validateScale,
} from "@/utils/measurementUtils";
import { useCanvasState } from "@/components/takeoff/hooks/useCanvasState";
import { useCanvasMedia } from "@/components/takeoff/hooks/useCanvasMedia";
import { useCanvasInteractions } from "@/components/takeoff/hooks/useCanvasInteractions";
import CanvasToolbar from "@/components/takeoff/CanvasToolbar";
import CalibrationDialog from "@/components/takeoff/CalibrationDialog";
import CanvasOverlays from "@/components/takeoff/CanvasOverlays";
import CanvasViewport from "@/components/takeoff/CanvasViewport";
import MeasurementsLayer from "@/components/takeoff/layers/MeasurementsLayer";
import DraftLayer from "@/components/takeoff/layers/DraftLayer";
import { generateClientId } from "@/utils/id";
import {
  getMeasurementColor,
  getMeasurementType,
} from "@/utils/takeoffMeasurement";
import { measurementBelongsToPlan } from "@/utils/planDocument";
import { useConfirm } from "@/contexts/ConfirmProvider";

const MIN_DISTANCE = 0.001; // Minimum valid distance in pixels
const MIN_LINEAR_EDIT_DISTANCE = 2; // Prevent collapsing line while editing
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// Configure PDF.js worker
interface FloorPlanCanvasProps {
  takeoffItems: TakeoffItem[];
  activeItemId: string | null;
  activeTool: TakeoffMode | null;
  activeColor: string;
  onSelectTool: (type: TakeoffMode) => void;
  onFinishTool: () => void;
  onColorChange: (color: string) => void;
  registerUploadHandler: (handler: (e: React.ChangeEvent<HTMLInputElement>) => void) => void;
}

const FloorPlanCanvas: React.FC<FloorPlanCanvasProps> = ({
  activeTool: activeToolProp,
  activeColor: activeColorProp,
  onSelectTool,
  onFinishTool,
  onColorChange,
  registerUploadHandler,
}) => {
  const {
    currentProjectId,
    activePlanId,
    takeoffItems,
    activeItemId,
    activeTool,
    activeColor,
    setActiveTool,
    scales,
    calibrationMode,
    currentPage,
    backgroundImage,
    setCalibrationMode,
    setScale,
    setCalibrationLine,
    setTakeoffItems,
    setCurrentPage,
    setNumPages: setStoreNumPages,
    setBackgroundImage,
    addMeasurement,
    ensureCanvasItemId,
    updateTakeoffItem,
    removeMeasurement,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useTakeoffStore();
  const {
    stageRef,
    containerRef,
    selectedShapeRef,
    spatialIndexRef,
    image,
    setImage,
    imageScale,
    setImageScale,
    stageSize,
    setStageSize,
    stageScale,
    setStageScale,
    stagePos,
    setStagePos,
    isPanningMode,
    setIsPanningMode,
    isSelectMode,
    setIsSelectMode,
    isDraggingObject,
    setIsDraggingObject,
    isShiftPressed,
    setIsShiftPressed,
    currentPoints,
    setCurrentPoints,
    mousePos,
    setMousePos,
    snappedPoint,
    setSnappedPoint,
    selectedMeasurement,
    setSelectedMeasurement,
    hoveredPoint,
    setHoveredPoint,
    hoveredMeasurement,
    setHoveredMeasurement,
    hoveredEdge,
    setHoveredEdge,
    activeDragPoint,
    setActiveDragPoint,
    calibrationPoint1,
    setCalibrationPoint1,
    pdfDoc,
    setPdfDoc,
    numPages,
    setNumPages,
    currentScale,
  } = useCanvasState({
    takeoffItems,
    activeItemId,
    scales,
    currentPage,
  });
  const [snapEnabled, setSnapEnabled] = useState(true);
  const confirm = useConfirm();
  const snapSettings = useMemo(
    () => ({
      vertex: snapEnabled,
      perpendicular: snapEnabled,
      intersection: snapEnabled,
    }),
    [snapEnabled]
  );
  const [pendingCalibration, setPendingCalibration] = useState<
    { p1: Point; p2: Point } | null
  >(null);
  const [hintVisible, setHintVisible] = useState(false);

  // Fade the draw-hint in ~500ms after a tool activates so it doesn't flash
  // on quick draws.
  useEffect(() => {
    if (!activeTool && !calibrationMode) {
      setHintVisible(false);
      return;
    }
    setHintVisible(false);
    const timer = window.setTimeout(() => setHintVisible(true), 500);
    return () => window.clearTimeout(timer);
  }, [activeTool, calibrationMode]);

  // Rebuild spatial index when measurements change
  useEffect(() => {
    const index = spatialIndexRef.current;
    index.clear();
    
    takeoffItems.forEach((item) => {
      item.measurements
        .filter(
          (m) => measurementBelongsToPlan(m, activePlanId) && m.page === currentPage && !m.hidden
        )
        .forEach((m) => {
          m.points.forEach((p, idx) => {
            index.addPoint(p, item.id, m.id, idx);
          });
        });
    });
  }, [takeoffItems, currentPage]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!activeTool) return;
      setCurrentPoints([]);
      onFinishTool();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool, onFinishTool, setCurrentPoints]);

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

  const { handleFileUpload, changePage, hasLoadedPlan, planLoadStatus, planLoadError } =
    useCanvasMedia({
    containerRef,
    backgroundImage,
    activePlanId,
    setBackgroundImage,
    setCurrentPage,
    setStoreNumPages,
    currentPage,
    image,
    setImage,
    setImageScale,
    setStageSize,
    setStageScale,
    setStagePos,
    pdfDoc,
    setPdfDoc,
    numPages,
    setNumPages,
    projectId: currentProjectId ?? undefined,
  });

  useEffect(() => {
    registerUploadHandler(handleFileUpload);
  }, [registerUploadHandler, handleFileUpload]);

  const {
    getSnappedPoint,
    getAngleSnappedPoint,
    formatDistance,
    formatArea,
    calculateAreaFromPoints,
    getEdgeMidpoints,
  } = useCanvasInteractions({
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
  });

  const selectedMeasurementShape = useMemo(() => {
    if (!selectedMeasurement) return null;
    const item = takeoffItems.find((entry) => entry.id === selectedMeasurement.itemId);
    if (!item) return null;
    return item.measurements.find(
      (measurement) => measurement.id === selectedMeasurement.measurementId
    );
  }, [selectedMeasurement, takeoffItems]);

  const zoomToFit = useCallback(() => {
    setStageScale(1);
    setStagePos({ x: 0, y: 0 });
  }, [setStagePos, setStageScale]);

  const zoomToSelection = useCallback(() => {
    if (!selectedMeasurementShape) return;
    if (!containerRef.current) return;

    // Points are in image-pixel space; convert bounds to stage-pixel space so
    // they can be compared to the viewport size.
    const safeImageScale = imageScale > 0 ? imageScale : 1;
    const xs = selectedMeasurementShape.points.map((point) => point.x * safeImageScale);
    const ys = selectedMeasurementShape.points.map((point) => point.y * safeImageScale);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const selectionWidth = Math.max(20, maxX - minX);
    const selectionHeight = Math.max(20, maxY - minY);
    const padding = 80;
    const viewportWidth = containerRef.current.offsetWidth;
    const viewportHeight = containerRef.current.offsetHeight;

    const targetScale = Math.max(
      0.2,
      Math.min(
        5,
        Math.min(
          viewportWidth / (selectionWidth + padding * 2),
          viewportHeight / (selectionHeight + padding * 2)
        )
      )
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setStageScale(targetScale);
    setStagePos({
      x: viewportWidth / 2 - centerX * targetScale,
      y: viewportHeight / 2 - centerY * targetScale,
    });
  }, [containerRef, selectedMeasurementShape, setStagePos, setStageScale, imageScale]);

  const handleToggleSnap = useCallback(() => {
    setSnapEnabled((prev) => !prev);
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
    const mType = getMeasurementType(measurement, item);
    let newQuantity = measurement.quantity;
      if (mType === "area") {
      newQuantity = calculateAreaFromPoints(updatedPoints);
      } else if (mType === "linear" && updatedPoints.length === 2) {
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
      calculateAreaFromPoints,
      updateTakeoffItem,
    ]
  );

  // Handle canvas click
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
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

    // Convert stage-pixel → image-pixel so stored coords are viewport-independent.
    const safeImageScale = imageScale > 0 ? imageScale : 1;
    let point = {
      x: (pointerPosition.x - stagePos.x) / stageScale / safeImageScale,
      y: (pointerPosition.y - stagePos.y) / stageScale / safeImageScale,
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

    // Clamp to image bounds (image-pixel space).
    const boundsW = image?.width ?? stageSize.width / safeImageScale;
    const boundsH = image?.height ?? stageSize.height / safeImageScale;
    point = {
      x: Math.max(0, Math.min(boundsW, point.x)),
      y: Math.max(0, Math.min(boundsH, point.y)),
    };

    // Apply advanced snapping — but Shift-lock takes priority for active drawing
    // tools so the user can always force an axis-constrained segment.
    const isDrawingWithShift =
      isShiftPressed && (activeTool === 'linear' || activeTool === 'area' || calibrationMode);
    if (!isDrawingWithShift) {
      const snapped = getSnappedPoint(point);
      if (snapped) point = snapped;
    }

    if (calibrationMode) {
      if (pendingCalibration) {
        // Waiting on the distance modal — ignore further canvas clicks.
        return;
      }
      if (!calibrationPoint1) {
        setCalibrationPoint1(point);
        return;
      }
      let finalPoint = point;
      if (isShiftPressed) {
        finalPoint = getAngleSnappedPoint(point, calibrationPoint1);
      }
      const pixelDist = calculateDistance(calibrationPoint1, finalPoint);
      if (pixelDist < MIN_DISTANCE) {
        // Same click as p1 — ignore and let the user click again.
        return;
      }
      setPendingCalibration({ p1: calibrationPoint1, p2: finalPoint });
      return;
    }

    if (!activeTool || !activePlanId) return;

    const canvasItemId = ensureCanvasItemId();
    const now = new Date().toISOString();
    
    if (activeTool === "count") {
      const canvasItem = takeoffItems.find((item) => item.id === canvasItemId);
      const session = activeCountMeasurementRef.current;

      const existingMeasurement =
        canvasItem &&
        session &&
        session.itemId === canvasItemId &&
        session.planId === activePlanId &&
        session.page === currentPage &&
        session.color === activeColor
          ? canvasItem.measurements.find((m) => m.id === session.measurementId)
          : undefined;

      if (canvasItem && existingMeasurement) {
        const nextPoints = [...existingMeasurement.points, point];
        const updatedMeasurement: Measurement = {
          ...existingMeasurement,
          points: nextPoints,
          quantity: nextPoints.length,
          color: activeColor,
          metadata: {
            createdAt: existingMeasurement.metadata?.createdAt ?? now,
            lastModified: now,
            confidence: 1.0,
          },
        };

        const validation = validateMeasurement(updatedMeasurement, "count");
        if (!validation.isValid) {
          console.warn("Invalid measurement:", validation.error);
          return;
        }

        const diff = updatedMeasurement.quantity - existingMeasurement.quantity;
        updateTakeoffItem(canvasItemId, {
          measurements: canvasItem.measurements.map((measurement) =>
            measurement.id === existingMeasurement.id
              ? updatedMeasurement
              : measurement
          ),
          totalQuantity: canvasItem.totalQuantity + diff,
        });
      } else {
        const measurement: Measurement = {
          id: generateClientId(),
          points: [point],
          quantity: 1,
          planId: activePlanId,
          page: currentPage,
          type: activeTool,
          color: activeColor,
          metadata: {
            createdAt: now,
            lastModified: now,
            confidence: 1.0,
          },
        };
        const validation = validateMeasurement(measurement, "count");
        if (validation.isValid) {
          addMeasurement(canvasItemId, measurement);
          activeCountMeasurementRef.current = {
            itemId: canvasItemId,
            measurementId: measurement.id,
            planId: activePlanId,
            page: currentPage,
            color: activeColor,
          };
        } else {
          console.warn("Invalid measurement:", validation.error);
        }
      }
    } else if (activeTool === "linear") {
      if (currentPoints.length === 0) {
        setCurrentPoints([point]);
      } else {
        const p1 = currentPoints[0];
        let p2 = point;
        if (isShiftPressed) {
          p2 = getAngleSnappedPoint(point, p1);
        }
        if (calculateDistance(p1, p2) < MIN_DISTANCE) {
          return;
        }
        const qty = calculateQuantity([p1, p2], "linear", currentScale);
        const lineLength = calculateDistance(p1, p2);
        const confidence = currentScale
          ? Math.min(1.0, lineLength / (currentScale * 10))
          : 0.5;
        const measurement: Measurement = {
          id: generateClientId(),
          points: [p1, p2],
          quantity: qty,
          planId: activePlanId,
          page: currentPage,
          type: "linear",
          color: activeColor,
          metadata: {
            createdAt: now,
            lastModified: now,
            confidence: Math.max(0.1, confidence),
          },
        };
        const validation = validateMeasurement(measurement, "linear");
        if (validation.isValid) {
          addMeasurement(canvasItemId, measurement);
          // Tool stays active; next click starts a fresh measurement.
          setCurrentPoints([]);
        } else {
          console.warn("Invalid measurement:", validation.error);
        }
      }
    } else if (activeTool === "area") {
      let finalPoint = point;
      if (currentPoints.length > 0 && isShiftPressed) {
        finalPoint = getAngleSnappedPoint(
          point,
          currentPoints[currentPoints.length - 1]
        );
      }

      // Auto-close when clicking near the first vertex (snap radius in screen px)
      const closeSnapRadius = 12 / stageScale;
      if (
        currentPoints.length >= 3 &&
        calculateDistance(finalPoint, currentPoints[0]) < closeSnapRadius
      ) {
        // Treat this as a finish — call the same logic as double-click
        const area = calculateAreaFromPoints(currentPoints);
        const quantity = area;
        const pixelArea = calculateArea(currentPoints);
        const confidence = currentScale
          ? Math.min(1.0, pixelArea / (currentScale * currentScale * 100))
          : 0.5;
        const closeMeasurement: Measurement = {
          id: generateClientId(),
          points: [...currentPoints],
          quantity,
          planId: activePlanId,
          page: currentPage,
          type: activeTool,
          color: activeColor,
          metadata: {
            createdAt: now,
            lastModified: now,
            confidence: Math.max(0.1, confidence),
          },
        };
        const validation = validateMeasurement(closeMeasurement, "area");
        if (validation.isValid) {
          addMeasurement(ensureCanvasItemId(), closeMeasurement);
          setCurrentPoints([]);
          setActiveTool(null);
        } else {
          console.warn("Invalid measurement:", validation.error);
        }
        return;
      }

      setCurrentPoints([...currentPoints, finalPoint]);
    }
    },
    [
      isPanningMode,
      isSelectMode,
      calibrationMode,
      calibrationPoint1,
      pendingCalibration,
      activePlanId,
      activeTool,
      activeColor,
      setActiveTool,
      ensureCanvasItemId,
      currentPoints,
      isShiftPressed,
      stagePos,
      stageScale,
      getSnappedPoint,
      getAngleSnappedPoint,
      calculateAreaFromPoints,
      currentScale,
      currentPage,
      addMeasurement,
      takeoffItems,
      updateTakeoffItem,
      setSelectedMeasurement,
      setCalibrationPoint1,
      setCurrentPoints,
      stageSize,
      image,
      imageScale,
    ]
  );

  // Throttle mouse move for performance
  const mouseMoveThrottleRef = useRef<number | null>(null);
  const lastMouseMoveTimeRef = useRef<number>(0);
  const THROTTLE_MS = 16; // ~60fps
  const activeCountMeasurementRef = useRef<{
    itemId: string;
    measurementId: string;
    planId: string;
    page: number;
    color: string;
  } | null>(null);

  useEffect(() => {
    if (activeTool !== "count") {
      activeCountMeasurementRef.current = null;
      return;
    }

    const session = activeCountMeasurementRef.current;
    if (!session) return;

    if (
      session.planId !== activePlanId ||
      session.page !== currentPage ||
      session.color !== activeColor
    ) {
      activeCountMeasurementRef.current = null;
    }
  }, [activeTool, activePlanId, currentPage, activeColor]);

  // Handle mouse move for ghost line (throttled with error handling)
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const processMouseMove = () => {
        try {
          const stage = e.target.getStage();
          if (!stage) return;

          const pointerPosition = stage.getPointerPosition();
          if (!pointerPosition) return;

          const safeImageScale = imageScale > 0 ? imageScale : 1;
          let point = {
            x: (pointerPosition.x - stagePos.x) / stageScale / safeImageScale,
            y: (pointerPosition.y - stagePos.y) / stageScale / safeImageScale,
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

          // Clamp to image bounds (image-pixel space).
          const boundsW = image?.width ?? stageSize.width / safeImageScale;
          const boundsH = image?.height ?? stageSize.height / safeImageScale;
          point = {
            x: Math.max(0, Math.min(boundsW, point.x)),
            y: Math.max(0, Math.min(boundsH, point.y)),
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

    },
    [stagePos, stageScale, getSnappedPoint, stageSize, setMousePos, setSnappedPoint, image, imageScale]
  );

  // Handle double click to finish area
  const handleDblClick = useCallback(() => {
    if (activeTool === "area" && activePlanId && currentPoints.length > 2) {
      // Validate measurement before adding
      const area = calculateAreaFromPoints(currentPoints);
      const quantity = area;

      // Calculate confidence based on polygon area and scale
      const pixelArea = calculateArea(currentPoints);
      const confidence = currentScale
        ? Math.min(1.0, pixelArea / (currentScale * currentScale * 100))
        : 0.5;
      const now = new Date().toISOString();

      const measurement: Measurement = {
        id: generateClientId(),
        points: [...currentPoints],
        quantity,
        planId: activePlanId,
        page: currentPage,
        type: activeTool,
        color: activeColor,
        metadata: {
          createdAt: now,
          lastModified: now,
          confidence: Math.max(0.1, confidence),
        },
      };

      const validation = validateMeasurement(measurement, "area");
      if (validation.isValid) {
        addMeasurement(ensureCanvasItemId(), measurement);
        setCurrentPoints([]);
      } else {
        console.warn("Invalid measurement:", validation.error);
      }
    }
  }, [
    activePlanId,
    activeTool,
    activeColor,
    ensureCanvasItemId,
    currentPoints,
    calculateAreaFromPoints,
    currentPage,
    addMeasurement,
    currentScale,
    setCurrentPoints,
  ]);

  // Handle context menu (right-click) to finish area.
  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.evt.preventDefault();
      handleDblClick();
    },
    [handleDblClick]
  );

  const handleClearAllMeasurements = useCallback(async () => {
    if (!activePlanId) return;
    const ok = await confirm({
      title: 'Clear all measurements?',
      message: 'Every measurement on this plan will be removed. This cannot be undone.',
      confirmLabel: 'Clear all',
      variant: 'danger',
    });
    if (!ok) return;

    const nextItems = takeoffItems.map((item) => {
      const keptMeasurements = item.measurements.filter(
        (measurement) => !measurementBelongsToPlan(measurement, activePlanId)
      );
      const removedQuantity = item.measurements
        .filter((measurement) => measurementBelongsToPlan(measurement, activePlanId))
        .reduce((sum, measurement) => sum + measurement.quantity, 0);

      if (keptMeasurements.length === item.measurements.length) {
        return item;
      }

      return {
        ...item,
        measurements: keptMeasurements,
        totalQuantity: item.totalQuantity - removedQuantity,
      };
    });

    setSelectedMeasurement(null);
    setCurrentPoints([]);
    activeCountMeasurementRef.current = null;
    setTakeoffItems(nextItems);
  }, [activePlanId, setTakeoffItems, setCurrentPoints, takeoffItems, confirm]);

  // Apply Shift-lock to a vertex drag position so the ghost matches commit.
  // Anchor = other endpoint (linear) or previous polygon vertex (area).
  const resolveShiftLockedDragPos = useCallback(
    (
      itemId: string,
      measurementId: string,
      pointIndex: number,
      rawPos: Point
    ): Point => {
      if (!isShiftPressed) return rawPos;
      const item = takeoffItems.find((i) => i.id === itemId);
      if (!item) return rawPos;
      const measurement = item.measurements.find((m) => m.id === measurementId);
      if (!measurement) return rawPos;
      const mType = getMeasurementType(measurement, item);
      let anchor: Point | null = null;
      if (mType === "linear" && measurement.points.length === 2) {
        anchor = measurement.points[pointIndex === 0 ? 1 : 0];
      } else if (mType === "area" && measurement.points.length >= 2) {
        const prevIdx =
          (pointIndex - 1 + measurement.points.length) % measurement.points.length;
        anchor = measurement.points[prevIdx];
      }
      return anchor ? getAngleSnappedPoint(rawPos, anchor) : rawPos;
    },
    [takeoffItems, isShiftPressed]
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

    const mType = getMeasurementType(measurement, item);

    // Update the point
    let finalPos = newPos;

    // Shift-lock while adjusting: snap the dragged vertex to the nearest
    // 0/45/90 axis relative to its neighbor — same behavior as while drawing.
    if (isShiftPressed) {
      let anchor: Point | null = null;
      if (mType === "linear" && measurement.points.length === 2) {
        anchor = measurement.points[pointIndex === 0 ? 1 : 0];
      } else if (mType === "area" && measurement.points.length >= 2) {
        const prevIdx =
          (pointIndex - 1 + measurement.points.length) % measurement.points.length;
        anchor = measurement.points[prevIdx];
      }
      if (anchor) {
        finalPos = getAngleSnappedPoint(newPos, anchor);
      }
    }

    const safeImageScale = imageScale > 0 ? imageScale : 1;
    const boundsW = image?.width ?? stageSize.width / safeImageScale;
    const boundsH = image?.height ?? stageSize.height / safeImageScale;
    const clampedPos = {
      x: clamp(finalPos.x, 0, boundsW),
      y: clamp(finalPos.y, 0, boundsH),
    };

    const updatedPoints = [...measurement.points];
    updatedPoints[pointIndex] = clampedPos;

    if (
      mType === "linear" &&
      updatedPoints.length === 2 &&
      calculateDistance(updatedPoints[0], updatedPoints[1]) < MIN_LINEAR_EDIT_DISTANCE
    ) {
      return;
    }

    // Recalculate quantity
    let newQuantity = measurement.quantity;
      if (mType === "linear" && updatedPoints.length === 2) {
        newQuantity = calculateQuantity(updatedPoints, "linear", currentScale);
      } else if (mType === "area" && updatedPoints.length >= 3) {
      newQuantity = calculateAreaFromPoints(updatedPoints);
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
      stageSize,
      image,
      imageScale,
    ]
  );

  // Handle measurement group drag to move entire measurement
  const handleMeasurementDrag = useCallback(
    (itemId: string, measurementId: string, dragOffset: Point) => {
      const item = takeoffItems.find((i) => i.id === itemId);
    if (!item) return;

      const measurement = item.measurements.find((m) => m.id === measurementId);
    if (!measurement) return;

    if (!isFinite(dragOffset.x) || !isFinite(dragOffset.y)) return;

    const xs = measurement.points.map((p) => p.x);
    const ys = measurement.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Keep the whole measurement on the plan image while dragging.
    const safeImageScale = imageScale > 0 ? imageScale : 1;
    const boundsW = image?.width ?? stageSize.width / safeImageScale;
    const boundsH = image?.height ?? stageSize.height / safeImageScale;
    const boundedOffset = {
      x: clamp(dragOffset.x, -minX, boundsW - maxX),
      y: clamp(dragOffset.y, -minY, boundsH - maxY),
    };

      const updatedPoints = measurement.points.map((p) => ({
      x: p.x + boundedOffset.x,
        y: p.y + boundedOffset.y,
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
    [takeoffItems, updateTakeoffItem, stageSize, image, imageScale]
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

    const mType = getMeasurementType(measurement, item);
    const updatedPoints = [...measurement.points];
    const idx1 = edgeIndex;
    const idx2 = (edgeIndex + 1) % measurement.points.length;

    const p1 = updatedPoints[idx1];
    const p2 = updatedPoints[idx2];

    let effectiveDelta = delta;

    // Acrobat-style: Constrain movement to be perpendicular to the edge (normal vector)
    // unless Shift is pressed for free translation
      if (!isShiftPressed && mType === "area") {
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

    const safeImageScale = imageScale > 0 ? imageScale : 1;
    const boundsW = image?.width ?? stageSize.width / safeImageScale;
    const boundsH = image?.height ?? stageSize.height / safeImageScale;
    const boundedDelta = {
      x: clamp(
        effectiveDelta.x,
        Math.max(-p1.x, -p2.x),
        Math.min(boundsW - p1.x, boundsW - p2.x)
      ),
      y: clamp(
        effectiveDelta.y,
        Math.max(-p1.y, -p2.y),
        Math.min(boundsH - p1.y, boundsH - p2.y)
      ),
    };

    updatedPoints[idx1] = {
      x: p1.x + boundedDelta.x,
        y: p1.y + boundedDelta.y,
    };
    updatedPoints[idx2] = {
      x: p2.x + boundedDelta.x,
        y: p2.y + boundedDelta.y,
    };

    let newQuantity = 0;
      if (mType === "linear" && updatedPoints.length === 2) {
        newQuantity = calculateQuantity(updatedPoints, "linear", currentScale);
      } else if (mType === "area" && updatedPoints.length >= 3) {
      newQuantity = calculateAreaFromPoints(updatedPoints);
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
      calculateAreaFromPoints,
      updateTakeoffItem,
      isShiftPressed,
      stageSize,
      image,
      imageScale,
    ]
  );

  // Handle precision nudging with arrow keys
  const handleNudge = useCallback(
    (
      direction: "up" | "down" | "left" | "right",
      isLarge: boolean,
      isFine: boolean
    ) => {
    if (!selectedMeasurement) return;

    // Premium nudge: if calibrated, step by real-world units;
    // otherwise keep screen-space behavior stable across zoom levels.
    const amount = (() => {
      if (currentScale && currentScale > 0) {
        const metersStep = isFine ? 0.01 : isLarge ? 0.1 : 0.025; // 1cm / 10cm / ~1in
        return metersStep * currentScale; // convert meters -> canvas pixels
      }
      const screenPixels = isFine ? 0.5 : isLarge ? 10 : 2;
      return screenPixels / Math.max(stageScale, 0.1);
    })();
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
      currentScale,
      stageScale,
    ]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCurrentPoints([]);
        setCalibrationMode(false);
        setCalibrationPoint1(null);
        setPendingCalibration(null);
      }
      if (e.key === "Enter" && currentPoints.length > 0) {
        e.preventDefault();
        handleDblClick();
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
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (e.shiftKey) {
          zoomToSelection();
        } else {
          zoomToFit();
        }
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
        handleNudge(direction, e.shiftKey, e.altKey);
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
    handleDblClick,
    undo,
    redo,
    canUndo,
    canRedo,
    zoomToFit,
    zoomToSelection,
  ]);

  // Handle zoom
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.12;
    const stage = e.target.getStage();
    if (!stage) return;
    const oldScale = stageScale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

      const newScale =
        e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clampedScale = Math.max(0.05, Math.min(20, newScale));

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
    [stageScale, stagePos, setStageScale, setStagePos]
  );

  // Update cursor dynamically
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;

    let cursor = "default";
    if (isPanningMode) cursor = "move";
    else if (isSelectMode) cursor = "pointer";
    else if (calibrationMode || activeTool) cursor = "none";

    container.style.cursor = cursor;
  }, [isPanningMode, isSelectMode, calibrationMode, activeTool, stageRef]);

  // Keep labels at a constant screen size regardless of zoom
  // Elements inside the imageScale group are affected by both stageScale (zoom)
  // and imageScale (fit-to-container). Divide by both so labels stay constant
  // size in screen pixels regardless of monitor.
  const labelScale = 1 / (stageScale * (imageScale > 0 ? imageScale : 1));
  const LABEL_FONT_SIZE = 12; // logical screen pixels
  // Compensates strokeWidth/radius values that were tuned when only stageScale
  // wrapped the layer. Now that the layer sits inside a Group scaled by both
  // stageScale and imageScale, multiplying by strokeScale restores the pre-fix
  // visual weight while still letting strokes grow with zoom.
  const strokeScale = 1 / (imageScale > 0 ? imageScale : 1);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden min-h-0">
      <CanvasToolbar
        calibrationMode={calibrationMode}
        currentScale={currentScale}
        activeTool={activeToolProp ?? activeTool}
        activeColor={activeColorProp ?? activeColor}
        onSelectTool={onSelectTool}
        onFinishTool={onFinishTool}
        onColorChange={onColorChange}
        onToggleCalibration={() => {
          const newMode = !calibrationMode;
          setCalibrationMode(newMode);
          setCalibrationPoint1(null);
          setPendingCalibration(null);
          if (newMode) {
            setIsPanningMode(false);
            setIsSelectMode(false);
            setActiveTool(null);
            setCurrentPoints([]);
          }
        }}
      />

      <CanvasViewport
        containerRef={containerRef}
        stageRef={stageRef}
        stageSize={stageSize}
        stageScale={stageScale}
        stagePos={stagePos}
        isPanningMode={isPanningMode}
        isDraggingObject={isDraggingObject}
        image={image}
        imageScale={imageScale}
        onStageClick={handleStageClick}
        onStageDblClick={handleDblClick}
        onStageMouseMove={handleMouseMove}
        onStageWheel={handleWheel}
        onStageContextMenu={handleContextMenu}
        onStageDragEnd={(e) => {
            if (e.target === e.target.getStage()) {
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }
          }}
        measurementsChildren={<>


            {/* Render takeoff items only when a plan image is loaded */}
            {hasLoadedPlan &&
              takeoffItems.map((item) =>
              item.measurements
                .filter(
          (m) => measurementBelongsToPlan(m, activePlanId) && m.page === currentPage && !m.hidden
        )
                .map((m) => {
                  const mType = getMeasurementType(m, item);
                  const mColor = getMeasurementColor(m, item);
                  if (mType === "linear" && m.points.length === 2) {
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
                    // Screen-constant cap length (perpendicular tick at each endpoint).
                    // Match the label height so the caps read as dimension-line ends.
                    const tickLen = LABEL_FONT_SIZE * 0.6 * strokeScale;
                    const tickDX = Math.sin(angle) * tickLen;
                    const tickDY = Math.cos(angle) * tickLen;
                    // Length of the segment and midpoint used to open a gap
                    // around the dimension label — |---- 300.13m ----|
                    const lineLen = Math.sqrt(dx * dx + dy * dy);
                    const ux = lineLen > 0 ? dx / lineLen : 0;
                    const uy = lineLen > 0 ? dy / lineLen : 0;
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    const labelText = formatDistance(
                      calculateQuantity(displayPoints, "linear", currentScale)
                    );
                    // Estimate label half-width in image-pixels. Konva Text width
                    // isn't known until render, so we use a generous character-count
                    // estimate (0.6× font size per char + padding) to guarantee the
                    // gap clears the text on any font/DPR.
                    const labelHalfWidth =
                      (labelText.length * LABEL_FONT_SIZE * 0.6 * 0.5 + 8) * labelScale;
                    const gapHalfMax = lineLen / 2 - 2 * strokeScale;
                    const gapHalf = Math.min(labelHalfWidth, Math.max(0, gapHalfMax));
                    const showGap = gapHalf > 0 && lineLen > 2 * gapHalf + 4 * strokeScale;
                    const gapStart = { x: midX - ux * gapHalf, y: midY - uy * gapHalf };
                    const gapEnd = { x: midX + ux * gapHalf, y: midY + uy * gapHalf };
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
                        onDragStart={(e) => {
                          if (e.target !== e.currentTarget) return;
                          setIsDraggingObject(true);
                        }}
                        ref={(node) => {
                          if (isSelected && node) {
                            selectedShapeRef.current = node;
                          }
                        }}
                        onDragEnd={(e) => {
                          const group = e.currentTarget;
                          if (e.target === e.currentTarget && isSelectMode) {
                            const offset = {
                              x: group.x(),
                              y: group.y(),
                            };
                            handleMeasurementDrag(item.id, m.id, offset);
                          }
                          setIsDraggingObject(false);
                          group.position({ x: 0, y: 0 });
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
                        {/* Selection highlight — hidden mid-drag to keep the plan visible. */}
                        {isSelected && !(dragging?.itemId === item.id && dragging?.measurementId === m.id) && (
                          <Line
                            points={[p1.x, p1.y, p2.x, p2.y]}
                            stroke={mColor}
                            strokeWidth={7 * strokeScale}
                            opacity={0.22}
                            listening={false}
                          />
                        )}
                        {/* Main line — thin dashed preview while an endpoint is being dragged. */}
                        {dragging?.itemId === item.id && dragging?.measurementId === m.id ? (
                          <Line
                            points={[p1.x, p1.y, p2.x, p2.y]}
                            stroke={mColor}
                            strokeWidth={1.5 * labelScale}
                            dash={[6 * labelScale, 4 * labelScale]}
                            opacity={0.7}
                            listening={false}
                          />
                        ) : showGap ? (
                          <>
                            {/* Split into two segments so the label sits in a gap */}
                            <Line
                              points={[p1.x, p1.y, gapStart.x, gapStart.y]}
                              stroke={mColor}
                              strokeWidth={(isSelected || isHovered ? 3 : 2) * strokeScale}
                              opacity={isHovered ? 0.7 : 1}
                            />
                            <Line
                              points={[gapEnd.x, gapEnd.y, p2.x, p2.y]}
                              stroke={mColor}
                              strokeWidth={(isSelected || isHovered ? 3 : 2) * strokeScale}
                              opacity={isHovered ? 0.7 : 1}
                            />
                          </>
                        ) : (
                          <Line
                            points={[p1.x, p1.y, p2.x, p2.y]}
                            stroke={mColor}
                            strokeWidth={(isSelected || isHovered ? 3 : 2) * strokeScale}
                            opacity={isHovered ? 0.7 : 1}
                          />
                        )}
                        {/* Perpendicular end-caps — suppressed while dragging an endpoint,
                            since the edit handle already renders its own tick. */}
                        {!(dragging?.itemId === item.id && dragging?.measurementId === m.id) && (
                          <>
                            <Line
                              points={[
                                p1.x - tickDX,
                                p1.y + tickDY,
                                p1.x + tickDX,
                                p1.y - tickDY,
                              ]}
                              stroke={mColor}
                              strokeWidth={(isSelected || isHovered ? 3.5 : 2.5) * strokeScale}
                              lineCap="round"
                            />
                            <Line
                              points={[
                                p2.x - tickDX,
                                p2.y + tickDY,
                                p2.x + tickDX,
                                p2.y - tickDY,
                              ]}
                              stroke={mColor}
                              strokeWidth={(isSelected || isHovered ? 3.5 : 2.5) * strokeScale}
                              lineCap="round"
                            />
                          </>
                        )}
                        {/* Dimension label — sits in the gap so it reads
                            like a printed dimension: |---- 500.07m ----| */}
                        <Text
                          x={midX}
                          y={midY}
                          text={labelText}
                          fontSize={LABEL_FONT_SIZE * labelScale}
                          fill={mColor}
                          rotation={angle * (180 / Math.PI)}
                          offsetX={labelText.length * LABEL_FONT_SIZE * 0.3 * labelScale}
                          offsetY={LABEL_FONT_SIZE * 0.5 * labelScale}
                          listening={false}
                        />

                        {/* Edge hit area for dragging entire segment */}
                        {isSelected && (
                          <Line
                            points={[p1.x, p1.y, p2.x, p2.y]}
                            stroke="transparent"
                            strokeWidth={15 * labelScale}
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
                            stroke={mColor}
                            strokeWidth={6 * strokeScale}
                            opacity={0.5}
                            listening={false}
                          />
                          )}

                        {/* Endpoint handles — perpendicular tick + tiny dot.
                            Tick and hover ring hide during drag so the underlying
                            plan feature stays visible at the cursor. */}
                        {isSelected &&
                          [0, 1].map((pointIndex) => {
                            const p = pointIndex === 0 ? p1 : p2;
                            const isHovered =
                              hoveredPoint?.itemId === item.id &&
                              hoveredPoint?.measurementId === m.id &&
                              hoveredPoint?.pointIndex === pointIndex;
                            const isDragging =
                              activeDragPoint?.itemId === item.id &&
                              activeDragPoint?.measurementId === m.id &&
                              activeDragPoint?.pointIndex === pointIndex;

                            // Perpendicular tick geometry: rotate 90° from line direction.
                            const perpTickLen = 8 * labelScale;
                            const perpDX = -Math.sin(angle) * perpTickLen;
                            const perpDY = Math.cos(angle) * perpTickLen;
                            const dotRadius = 2 * labelScale;
                            const hoverRingRadius = 7 * labelScale;
                            const hitRadius = 10 * labelScale;

                            return (
                              <React.Fragment key={`handle-${pointIndex}`}>
                                {/* Perpendicular tick — hidden while dragging. */}
                                {!isDragging && (
                                  <Line
                                    listening={false}
                                    points={[
                                      p.x - perpDX,
                                      p.y - perpDY,
                                      p.x + perpDX,
                                      p.y + perpDY,
                                    ]}
                                    stroke={mColor}
                                    strokeWidth={1.5 * labelScale}
                                  />
                                )}
                                {/* Hover ring — appears on hover, hidden on drag. */}
                                {isHovered && !isDragging && (
                                  <Circle
                                    listening={false}
                                    x={p.x}
                                    y={p.y}
                                    radius={hoverRingRadius}
                                    stroke={mColor}
                                    strokeWidth={1.5 * labelScale}
                                    opacity={0.6}
                                  />
                                )}
                                {/* Precise center dot — always visible, sits on the exact vertex. */}
                                <Circle
                                  listening={false}
                                  x={p.x}
                                  y={p.y}
                                  radius={dotRadius}
                                  fill={mColor}
                                />
                                {/* Invisible hit target — larger than the visuals so the
                                    handle is easy to grab, but doesn't obscure the plan. */}
                                <Circle
                                  x={p.x}
                                  y={p.y}
                                  radius={hitRadius}
                                  fill="rgba(0,0,0,0.001)"
                                  draggable={true}
                                  onDragStart={(e) => {
                                    e.cancelBubble = true;
                                    setIsDraggingObject(true);
                                    setActiveDragPoint({
                                      itemId: item.id,
                                      measurementId: m.id,
                                      pointIndex,
                                      pos: p,
                                    });
                                    const container = e.target
                                      .getStage()
                                      ?.container();
                                    if (container)
                                      container.style.cursor = "grabbing";
                                  }}
                                  onDragMove={(e) => {
                                    const raw = e.target.position();
                                    const pos = resolveShiftLockedDragPos(
                                      item.id,
                                      m.id,
                                      pointIndex,
                                      raw
                                    );
                                    if (pos.x !== raw.x || pos.y !== raw.y) {
                                      e.target.position(pos);
                                    }
                                    setActiveDragPoint({
                                      itemId: item.id,
                                      measurementId: m.id,
                                      pointIndex,
                                      pos,
                                    });
                                  }}
                                  onDragEnd={(e) => {
                                    setIsDraggingObject(false);
                                    setActiveDragPoint(null);
                                    const pos = e.target.position();
                                    handlePointDrag(item.id, m.id, pointIndex, pos);
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
                                      pointIndex,
                                    });
                                    const container = e.target
                                      .getStage()
                                      ?.container();
                                    if (container)
                                      container.style.cursor = "crosshair";
                                  }}
                                  onMouseLeave={(e) => {
                                    setHoveredPoint(null);
                                    const container = e.target
                                      .getStage()
                                      ?.container();
                                    if (container)
                                      container.style.cursor = "pointer";
                                  }}
                                />
                              </React.Fragment>
                            );
                          })}
                      </Group>
                    );
                  } else if (mType === "polyline" && m.points.length >= 2) {
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
                    let totalLen = 0;
                    for (let i = 1; i < displayPoints.length; i++) {
                      totalLen += calculateDistance(displayPoints[i - 1], displayPoints[i]);
                    }
                    const totalQty = currentScale && currentScale > 0
                      ? totalLen / currentScale
                      : totalLen;
                    const midX =
                      displayPoints.reduce((acc, p) => acc + p.x, 0) / displayPoints.length;
                    const midY =
                      displayPoints.reduce((acc, p) => acc + p.y, 0) / displayPoints.length;
                    return (
                      <Group key={m.id}>
                        <Line
                          points={displayPoints.flatMap((p) => [p.x, p.y])}
                          stroke={mColor}
                          strokeWidth={2 * strokeScale}
                          lineJoin="round"
                          lineCap="round"
                        />
                        {displayPoints.map((p, i) => (
                          <Circle
                            key={i}
                            x={p.x}
                            y={p.y}
                            radius={2 * strokeScale}
                            fill={mColor}
                            listening={false}
                          />
                        ))}
                        <Text
                          x={midX}
                          y={midY}
                          text={formatDistance(totalQty)}
                          fontSize={LABEL_FONT_SIZE * labelScale}
                          fill={mColor}
                          align="center"
                          verticalAlign="middle"
                          offsetY={4 * labelScale}
                          listening={false}
                        />
                      </Group>
                    );
                  } else if (mType === "area") {
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
                        onDragStart={(e) => {
                          if (e.target !== e.currentTarget) return;
                          setIsDraggingObject(true);
                        }}
                        ref={(node) => {
                          if (isSelected && node) {
                            selectedShapeRef.current = node;
                          }
                        }}
                        onDragEnd={(e) => {
                          const group = e.currentTarget;
                          if (e.target === e.currentTarget && isSelectMode) {
                            const offset = {
                              x: group.x(),
                              y: group.y(),
                            };
                            handleMeasurementDrag(item.id, m.id, offset);
                          }
                          setIsDraggingObject(false);
                          group.position({ x: 0, y: 0 });
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
                          stroke={mColor}
                          strokeWidth={(isSelected || isHovered ? 4 : 2) * strokeScale}
                          fill={mColor + "44"}
                          opacity={isHovered ? 0.8 : 1}
                          closed
                        />
                        {/* Selection highlight */}
                        {isSelected && (
                          <Line
                            points={displayPoints.flatMap((p) => [p.x, p.y])}
                            stroke={mColor}
                            strokeWidth={8 * strokeScale}
                            opacity={0.3}
                            closed
                            listening={false}
                          />
                        )}
                        <Text
                          x={center.x}
                          y={center.y}
                          text={formatArea(m.quantity)}
                          fontSize={LABEL_FONT_SIZE * labelScale}
                          fontStyle="bold"
                          fill={mColor}
                          align="center"
                          verticalAlign="middle"
                          offsetY={0}
                          listening={false}
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
                                strokeWidth={15 * strokeScale}
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
                                  stroke={mColor}
                                  strokeWidth={6 * strokeScale}
                                  opacity={0.5}
                                  listening={false}
                                />
                              )}
                            </Group>
                          );
                        })}
                      </Group>
                    );
                  } else if (mType === "count") {
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
                          radius={(isSelected || isHovered ? 8 : 6) * strokeScale}
                          fill={mColor}
                          stroke="white"
                          strokeWidth={(isSelected || isHovered ? 3 : 2) * strokeScale}
                          draggable={isSelectMode}
                          onDragStart={(e) => {
                            setIsDraggingObject(true);
                            setActiveDragPoint({
                              itemId: item.id,
                              measurementId: m.id,
                              pointIndex: idx,
                              pos: p,
                            });
                            const container = e.target.getStage()?.container();
                            if (container) container.style.cursor = "grabbing";
                          }}
                          onDragMove={(e) => {
                            if (!isSelectMode) return;
                            const raw = e.target.position();
                            const pos = resolveShiftLockedDragPos(
                              item.id,
                              m.id,
                              idx,
                              raw
                            );
                            if (pos.x !== raw.x || pos.y !== raw.y) {
                              e.target.position(pos);
                            }
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
                            if (!isSelectMode) return;
                            handlePointDrag(item.id, m.id, idx, e.target.position());
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

            {/* Draggable vertices in select mode (area only).
                Linear/count have dedicated drag handles above. */}
            {isSelectMode &&
              takeoffItems.map((item) =>
              item.measurements
                  .filter(
          (m) => measurementBelongsToPlan(m, activePlanId) && m.page === currentPage && !m.hidden
        )
                  .filter((m) => getMeasurementType(m, item) === "area")
                  .flatMap((m) => {
                    const mColor = getMeasurementColor(m, item);
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
                        radius={(isSelected ? 10 : isHovered ? 8 : 6) * strokeScale}
                          fill={
                            isSelected
                              ? mColor
                              : isHovered
                                ? mColor
                                : "white"
                          }
                        stroke={mColor}
                        strokeWidth={(isSelected || isHovered ? 3 : 2) * strokeScale}
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
                          const raw = e.target.position();
                          const pos = resolveShiftLockedDragPos(
                            item.id,
                            m.id,
                            idx,
                            raw
                          );
                          if (pos.x !== raw.x || pos.y !== raw.y) {
                            e.target.position(pos);
                          }
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
                        shadowColor={isSelected ? mColor : undefined}
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
                  .filter(
          (m) => measurementBelongsToPlan(m, activePlanId) && m.page === currentPage && !m.hidden
        )
                  .filter((m) => getMeasurementType(m, item) === "area" && m.points.length >= 3)
                  .flatMap((m) => {
                    const mColor = getMeasurementColor(m, item);
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
                        radius={(isHovered ? 7 : 5) * strokeScale}
                        fill="white"
                        stroke={mColor}
                        strokeWidth={2 * strokeScale}
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

        </>}
        draftChildren={<>
            {/* Render current drawing points */}
            {currentPoints.length > 0 && activeTool && (
              <>
                {currentPoints.map((p, i) => {
                  const tickLen = 8;
                  const isFirst = i === 0 && activeTool === "area" && currentPoints.length >= 3;
                  // Check if cursor is near the first point (for close-area highlight)
                  const closeSnapRadius = 12 / stageScale;
                  const nearClose = isFirst && mousePos && calculateDistance(mousePos, p) < closeSnapRadius;
                  return (
                    <Group key={i}>
                      {/* First vertex of area: large ring to indicate click-to-close */}
                      {isFirst ? (
                        <>
                          <Circle
                            x={p.x}
                            y={p.y}
                            radius={(nearClose ? 10 : 6) * labelScale}
                            stroke={activeColor}
                            strokeWidth={2 * labelScale}
                            fill={nearClose ? activeColor : "rgba(255,255,255,0.6)"}
                            listening={false}
                          />
                        </>
                      ) : (
                        <>
                          <Line
                            points={[p.x - tickLen * labelScale, p.y, p.x + tickLen * labelScale, p.y]}
                            stroke={activeColor}
                            strokeWidth={3 * labelScale}
                          />
                          <Circle
                            x={p.x}
                            y={p.y}
                            radius={2 * labelScale}
                            fill={activeColor}
                          />
                        </>
                      )}
                    </Group>
                  );
                })}
                {currentPoints.length > 1 && (
                  <Line
                    points={currentPoints.flatMap((p) => [p.x, p.y])}
                    stroke={activeColor}
                    strokeWidth={2 * strokeScale}
                    dash={[5 * strokeScale, 5 * strokeScale]}
                  />
                )}
              </>
            )}

            {/* Ghost line preview */}
            {mousePos &&
              currentPoints.length > 0 &&
              activeTool &&
              !isPanningMode && (
              <>
                  {(activeTool === "linear" ||
                    activeTool === "area") &&
                    (() => {
                  const lastPoint = currentPoints[currentPoints.length - 1];
                  let previewPoint = mousePos;

                  // Shift-lock takes priority over vertex/grid snapping so the user
                  // can always force an axis-constrained segment.
                  if (isShiftPressed) {
                    previewPoint = getAngleSnappedPoint(mousePos, lastPoint);
                  } else {
                    const snapped = getSnappedPoint(mousePos);
                    if (snapped) previewPoint = snapped;
                  }

                  const dx = previewPoint.x - lastPoint.x;
                  const dy = previewPoint.y - lastPoint.y;
                  const angle = Math.atan2(dy, dx);
                      const qty = calculateQuantity(
                        [lastPoint, previewPoint],
                        "linear",
                        currentScale
                      );
                  const tickLen = 6 * strokeScale;
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
                            stroke={activeColor}
                            strokeWidth={2 * strokeScale}
                            dash={[5 * strokeScale, 5 * strokeScale]}
                          />
                          {activeTool === "area" &&
                            currentPoints.length > 1 && (
                              <Line
                                points={[
                                  previewPoint.x,
                                  previewPoint.y,
                                  currentPoints[0].x,
                                  currentPoints[0].y,
                                ]}
                                stroke={activeColor}
                                strokeWidth={1 * strokeScale}
                                dash={[2 * strokeScale, 2 * strokeScale]}
                              />
                            )}
                          <Line
                            points={[
                              lastPoint.x - tickDX,
                              lastPoint.y + tickDY,
                              lastPoint.x + tickDX,
                              lastPoint.y - tickDY,
                            ]}
                            stroke={activeColor}
                            strokeWidth={2 * strokeScale}
                          />
                          <Line
                            points={[
                              previewPoint.x - tickDX,
                              previewPoint.y + tickDY,
                              previewPoint.x + tickDX,
                              previewPoint.y - tickDY,
                            ]}
                            stroke={activeColor}
                            strokeWidth={2 * strokeScale}
                          />
                      <Text
                        x={(lastPoint.x + previewPoint.x) / 2}
                        y={(lastPoint.y + previewPoint.y) / 2}
                        text={formatDistance(qty)}
                        fontSize={LABEL_FONT_SIZE * labelScale}
                        fill={activeColor}
                        rotation={angle * (180 / Math.PI)}
                        align="center"
                        verticalAlign="bottom"
                        offsetY={4 * labelScale}
                      />
                    </Group>
                  );
                })()}
              </>
            )}

            {/* Live area readout at polygon centroid while drawing area */}
            {activeTool === "area" &&
              currentPoints.length >= 2 &&
              mousePos &&
              !isPanningMode &&
              (() => {
                const lastPoint = currentPoints[currentPoints.length - 1];
                let previewPoint = mousePos;
                if (isShiftPressed) {
                  previewPoint = getAngleSnappedPoint(mousePos, lastPoint);
                } else {
                  const snapped = getSnappedPoint(mousePos);
                  if (snapped) previewPoint = snapped;
                }
                const runningPoints = [...currentPoints, previewPoint];
                if (runningPoints.length < 3) return null;
                const area = calculateQuantity(runningPoints, "area", currentScale);
                if (!isFinite(area) || area <= 0) return null;
                const cx =
                  runningPoints.reduce((acc, p) => acc + p.x, 0) / runningPoints.length;
                const cy =
                  runningPoints.reduce((acc, p) => acc + p.y, 0) / runningPoints.length;
                return (
                  <Text
                    x={cx}
                    y={cy}
                    text={formatArea(area)}
                    fontSize={LABEL_FONT_SIZE * labelScale}
                    fill={activeColor}
                    align="center"
                    verticalAlign="middle"
                    listening={false}
                  />
                );
              })()}

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
              const tickLen = 6 * labelScale;
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
                      strokeWidth={2 * labelScale}
                      dash={[5 * labelScale, 5 * labelScale]}
                    />
                    <Line
                      points={[
                        calibrationPoint1.x - tickDX,
                        calibrationPoint1.y + tickDY,
                        calibrationPoint1.x + tickDX,
                        calibrationPoint1.y - tickDY,
                      ]}
                      stroke="red"
                      strokeWidth={2 * labelScale}
                    />
                    <Line
                      points={[
                        previewPoint.x - tickDX,
                        previewPoint.y + tickDY,
                        previewPoint.x + tickDX,
                        previewPoint.y - tickDY,
                      ]}
                      stroke="red"
                      strokeWidth={2 * labelScale}
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
                    calibrationPoint1.x - 6 * labelScale,
                    calibrationPoint1.y,
                    calibrationPoint1.x + 6 * labelScale,
                    calibrationPoint1.y,
                  ]}
                  stroke="red"
                  strokeWidth={2 * labelScale}
                />
                {/* Small center dot */}
                <Circle
                  x={calibrationPoint1.x}
                  y={calibrationPoint1.y}
                  radius={2 * labelScale}
                  fill="red"
                />
              </Group>
            )}

            {/* Snap indicator — shown when drawing or when dragging a point in select mode */}
            {snappedPoint && !isPanningMode && (activeTool || calibrationMode || (isSelectMode && activeDragPoint)) && (
              <>
                <Circle
                  x={snappedPoint.x}
                  y={snappedPoint.y}
                  radius={7 * labelScale}
                  stroke="#FF6B00"
                  strokeWidth={2 * labelScale}
                  fill="rgba(255, 107, 0, 0.12)"
                />
                <Circle
                  x={snappedPoint.x}
                  y={snappedPoint.y}
                  radius={2 * labelScale}
                  fill="#FF6B00"
                />
              </>
            )}

            {/* Custom on-canvas crosshair — replaces the OS pointer while a drawing
                tool is active so the native cursor never covers the line endpoint.
                Position follows Shift-lock and endpoint snapping to match commit. */}
            {mousePos && !isPanningMode && (activeTool || calibrationMode) && (() => {
              let cx = mousePos.x;
              let cy = mousePos.y;
              const lastPoint =
                currentPoints.length > 0
                  ? currentPoints[currentPoints.length - 1]
                  : calibrationMode
                    ? calibrationPoint1 ?? null
                    : null;
              if (isShiftPressed && lastPoint) {
                const p = getAngleSnappedPoint(mousePos, lastPoint);
                cx = p.x;
                cy = p.y;
              } else {
                const p = getSnappedPoint(mousePos);
                if (p) {
                  cx = p.x;
                  cy = p.y;
                }
              }
              const arm = 8 * labelScale;
              const gap = 2 * labelScale;
              return (
                <Group listening={false}>
                  <Line
                    points={[cx - arm, cy, cx - gap, cy]}
                    stroke="#111"
                    strokeWidth={1 * labelScale}
                  />
                  <Line
                    points={[cx + gap, cy, cx + arm, cy]}
                    stroke="#111"
                    strokeWidth={1 * labelScale}
                  />
                  <Line
                    points={[cx, cy - arm, cx, cy - gap]}
                    stroke="#111"
                    strokeWidth={1 * labelScale}
                  />
                  <Line
                    points={[cx, cy + gap, cx, cy + arm]}
                    stroke="#111"
                    strokeWidth={1 * labelScale}
                  />
                </Group>
              );
            })()}
        </>}
      />

      {hintVisible && mousePos && (activeTool || calibrationMode) && !isPanningMode && (() => {
        let text: string | null = null;
        if (calibrationMode) {
          text = calibrationPoint1
            ? 'Click end point · Esc to cancel'
            : 'Click start point';
        } else if (activeTool === 'linear') {
          text = currentPoints.length === 0
            ? 'Click start point'
            : 'Click end point';
        } else if (activeTool === 'area') {
          if (currentPoints.length === 0) text = 'Click to start';
          else if (currentPoints.length < 3) text = 'Click to add point';
          else text = 'Click first point or Enter to close';
        } else if (activeTool === 'count') {
          text = 'Click to place a count marker';
        }
        if (!text) return null;
        const left = mousePos.x * stageScale + stagePos.x + 14;
        const top = mousePos.y * stageScale + stagePos.y + 14;
        return (
          <div
            className="pointer-events-none absolute z-10 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-medium text-white shadow"
            style={{ left, top }}
          >
            {text}
          </div>
        );
      })()}

      {activePlanId && !hasLoadedPlan && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gray-200/80 z-5">
          <div className="pointer-events-auto max-w-sm mx-4 rounded-lg bg-white px-5 py-4 shadow-lg border border-gray-200 text-center">
            {planLoadStatus === "loading" && (
              <p className="text-sm font-medium text-gray-700">Loading plan…</p>
            )}
            {planLoadStatus === "error" && (
              <>
                <p className="text-sm font-semibold text-red-600">Could not load plan</p>
                <p className="mt-1 text-xs text-gray-500">
                  {planLoadError ?? "Check your connection or re-upload the drawing."}
                </p>
              </>
            )}
            {planLoadStatus !== "loading" && planLoadStatus !== "error" && (
              <p className="text-sm text-gray-600">Preparing drawing…</p>
            )}
          </div>
        </div>
      )}

      <CanvasOverlays
        stageScale={stageScale}
        setStageScale={setStageScale}
        pdfDocLoaded={Boolean(pdfDoc)}
        numPages={numPages}
        currentPage={currentPage}
        currentScale={currentScale}
        isPanningMode={isPanningMode}
        isSelectMode={isSelectMode}
        isShiftPressed={isShiftPressed}
        onChangePage={changePage}
        onTogglePan={() => {
          const newMode = !isPanningMode;
          setIsPanningMode(newMode);
          if (newMode) {
            setIsSelectMode(false);
            setCalibrationMode(false);
            setActiveTool(null);
            setCurrentPoints([]);
          }
        }}
        onToggleSelect={() => {
          const newMode = !isSelectMode;
          setIsSelectMode(newMode);
          if (newMode) {
            setIsPanningMode(false);
            setCalibrationMode(false);
            setActiveTool(null);
            setCurrentPoints([]);
          }
        }}
        onUndoPoint={() =>
          setCurrentPoints((prev) => (prev.length > 0 ? prev.slice(0, -1) : []))
        }
        onClearAll={() => {
          void handleClearAllMeasurements();
        }}
        snapEnabled={snapEnabled}
        onToggleSnap={handleToggleSnap}
      />
      <CalibrationDialog
        open={!!pendingCalibration}
        pixelDistance={
          pendingCalibration
            ? calculateDistance(pendingCalibration.p1, pendingCalibration.p2)
            : 0
        }
        onCancel={() => {
          setPendingCalibration(null);
          setCalibrationPoint1(null);
          setCalibrationMode(false);
        }}
        onConfirm={(dist) => {
          if (!pendingCalibration) return;
          const pixelDist = calculateDistance(
            pendingCalibration.p1,
            pendingCalibration.p2
          );
          const newScale = pixelDist / dist;
          const scaleValidation = validateScale(newScale);
          if (!scaleValidation.isValid) {
            // Bad scale — keep the modal open by not clearing pending state.
            // The dialog's own validation handles positive numbers; this catches
            // pathological pixel-distance edge cases.
            console.warn("Invalid scale:", scaleValidation.error);
            return;
          }
          setScale(currentPage, newScale);
          setCalibrationLine(currentPage, {
            p1: pendingCalibration.p1,
            p2: pendingCalibration.p2,
            distance: dist,
          });
          setPendingCalibration(null);
          setCalibrationPoint1(null);
          setCalibrationMode(false);
        }}
      />
    </div>
  );
};

export default FloorPlanCanvas;
