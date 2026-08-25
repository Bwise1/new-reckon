import React, { useRef, useEffect, useCallback, useState, useMemo } from "react";
import type { TakeoffItem, TakeoffMode } from "@/types/takeoff";
import {
  Line,
  Circle,
  Text,
  Group,
  Shape,
} from "react-konva";
import { useShallow } from "zustand/react/shallow";
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
  validateDeductions,
} from "@/utils/measurementUtils";
import { useCanvasState } from "@/components/takeoff/hooks/useCanvasState";
import { useCanvasMedia } from "@/components/takeoff/hooks/useCanvasMedia";
import { useCanvasInteractions } from "@/components/takeoff/hooks/useCanvasInteractions";
import CanvasToolbar from "@/components/takeoff/CanvasToolbar";
import CalibrationDialog from "@/components/takeoff/CalibrationDialog";
import CanvasOverlays from "@/components/takeoff/CanvasOverlays";
import CanvasViewport from "@/components/takeoff/CanvasViewport";
import { generateClientId } from "@/utils/id";
import {
  getMeasurementColor,
  getMeasurementType,
} from "@/utils/takeoffMeasurement";
import { measurementBelongsToPlan } from "@/utils/planDocument";
import { useConfirm } from "@/contexts/ConfirmProvider";

const MIN_DISTANCE = 0.001; // Minimum valid distance in image pixels
const MIN_LINEAR_EDIT_DISTANCE = 2; // Prevent collapsing line while editing
// Screen-space threshold for rejecting stutter clicks — a new vertex placed
// within this many CSS pixels of the previous one (in current run OR nearest
// existing) is treated as an accidental double-click and dropped silently.
const MIN_CLICK_SEPARATION_SCREEN = 8;
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
  onPlanLoadStatusChange?: (status: "idle" | "loading" | "ready" | "error") => void;
}

const FloorPlanCanvas: React.FC<FloorPlanCanvasProps> = ({
  activeTool: activeToolProp,
  activeColor: activeColorProp,
  onSelectTool,
  onFinishTool,
  onColorChange,
  registerUploadHandler,
  onPlanLoadStatusChange,
}) => {
  // Shallow-compared selector rather than useTakeoffStore(): a whole-store
  // subscription re-rendered this component (and its whole Konva tree) on every
  // unrelated mutation, e.g. typing in the BOQ sidebar.
  const {
    currentProjectId,
    activePlanId,
    takeoffItems,
    activeItemId,
    activeTool,
    activeColor,
    activeRealWidth,
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
    addDeductionToMeasurement,
    removeDeductionFromMeasurement,
    ensureCanvasItemId,
    updateTakeoffItem,
    removeMeasurement,
    undo,
    redo,
    canUndo,
    canRedo,
    boqTargeting,
    exitBoqTargeting,
    cancelBoqTargeting,
  } = useTakeoffStore(
    useShallow((s) => ({
      currentProjectId: s.currentProjectId,
      activePlanId: s.activePlanId,
      takeoffItems: s.takeoffItems,
      activeItemId: s.activeItemId,
      activeTool: s.activeTool,
      activeColor: s.activeColor,
      activeRealWidth: s.activeRealWidth,
      setActiveTool: s.setActiveTool,
      scales: s.scales,
      calibrationMode: s.calibrationMode,
      currentPage: s.currentPage,
      backgroundImage: s.backgroundImage,
      setCalibrationMode: s.setCalibrationMode,
      setScale: s.setScale,
      setCalibrationLine: s.setCalibrationLine,
      setTakeoffItems: s.setTakeoffItems,
      setCurrentPage: s.setCurrentPage,
      setNumPages: s.setNumPages,
      setBackgroundImage: s.setBackgroundImage,
      addMeasurement: s.addMeasurement,
      addDeductionToMeasurement: s.addDeductionToMeasurement,
      removeDeductionFromMeasurement: s.removeDeductionFromMeasurement,
      ensureCanvasItemId: s.ensureCanvasItemId,
      updateTakeoffItem: s.updateTakeoffItem,
      removeMeasurement: s.removeMeasurement,
      undo: s.undo,
      redo: s.redo,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      boqTargeting: s.boqTargeting,
      exitBoqTargeting: s.exitBoqTargeting,
      cancelBoqTargeting: s.cancelBoqTargeting,
    }))
  );
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
  const [isPdfSnap, setIsPdfSnap] = useState(false);
  const [uncalibratedWarning, setUncalibratedWarning] = useState(false);
  // Raw stage-relative CSS pixel position, kept separate from the
  // image-pixel `mousePos` used for drawing — this is what positions the
  // hover tooltip without needing to re-derive screen coords from it.
  const [screenPointerPos, setScreenPointerPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!uncalibratedWarning) return;
    const timer = window.setTimeout(() => setUncalibratedWarning(false), 2500);
    return () => window.clearTimeout(timer);
  }, [uncalibratedWarning]);

  // Pan/select and measuring are mutually exclusive: picking any measuring
  // tool (from the toolbar, a BOQ card, or a shortcut) turns pan AND select
  // OFF. Keyed on the tool BECOMING active so it doesn't fight
  // hold-space-to-pan, which sets pan transiently while a tool stays selected
  // and restores it on key-up — that path must keep working, so we only react
  // to activeTool going truthy.
  const prevActiveToolRef = useRef(activeTool);
  useEffect(() => {
    const prev = prevActiveToolRef.current;
    prevActiveToolRef.current = activeTool;
if (!prev && activeTool) {
      // Tool picked up: pan/select go down (mutual exclusivity).
      if (isPanningMode) setIsPanningMode(false);
      if (isSelectMode) setIsSelectMode(false);
    } else if (prev && !activeTool) {
      // Tool put down (Done, Escape, or switching BOQ cards mid-draw):
      // discard any unfinished in-progress points so they can't ghost into
      // the next measurement when a tool is picked up again.
      setCurrentPoints([]);
    }
  }, [activeTool, isPanningMode, setIsPanningMode, isSelectMode, setIsSelectMode]);

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
  // When set, points collected in `currentPoints` are treated as an
  // in-progress deduction for the referenced area measurement instead of
  // a new outer polygon. Set explicitly via right-click "Add deduction".
  const [deductionTarget, setDeductionTarget] = useState<{
    itemId: string;
    measurementId: string;
  } | null>(null);
  // Cursor is over a specific deduction outline. Tooltip shows −{area} instead
  // of the parent measurement's net.
  const [hoveredDeduction, setHoveredDeduction] = useState<{
    itemId: string;
    measurementId: string;
    index: number;
  } | null>(null);
  // Screen-position of the right-click context menu on a selected area.
  const [areaContextMenu, setAreaContextMenu] = useState<{
    itemId: string;
    measurementId: string;
    x: number;
    y: number;
  } | null>(null);

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

  // Escape is handled in one place — the staged handler in the main keydown
  // listener (run → session → tool). A second window listener here used to
  // double-handle it and immediately put the tool down, defeating the stages.

  // Window resize is handled where each size now lives: CanvasViewport observes
  // the pane for the Stage dimensions, and useCanvasMedia's ResizeObserver
  // recomputes the sheet (stageSize) from the plan's natural size. Writing
  // container dims into stageSize here made the "sheet" briefly equal the pane
  // on every resize — two writers, two meanings.

  const rotatePage = useTakeoffStore((s) => s.rotatePage);
  const rotateAllPages = useTakeoffStore((s) => s.rotateAllPages);
  const activeRealWidthLive = useTakeoffStore((s) => s.activeRealWidth);

  const { handleFileUpload, changePage, rerenderCurrentPage, refreshRegionPatch, regionPatch, refitToView, hasLoadedPlan, planLoadStatus, planLoadError, currentRotation, pdfNaturalSize, pdfDisplaySize, pdfSegmentIndexRef } =
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

  // Zoom-adaptive sharpness: when the zoom level settles, re-rasterize the
  // PDF page to match it (debounced so wheel/pinch streams don't thrash the
  // renderer). Konva keeps showing the old bitmap until the sharper one swaps
  // in at identical layout coordinates, so there's no visual jump — just the
  // plan snapping into focus. This is what keeps plans crisp at high zoom
  // instead of stretching one fixed-resolution render.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshRegionPatch(stageScale, stagePos);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [stageScale, stagePos, refreshRegionPatch]);

  useEffect(() => {
    onPlanLoadStatusChange?.(planLoadStatus);
  }, [planLoadStatus, onPlanLoadStatusChange]);

  // Re-fit the open plan when the fit-mode preference changes (from Settings).
  // Placed AFTER useCanvasMedia so refitToView exists — declaring the effect
  // before the hook that produces refitToView caused a use-before-init crash.
  useEffect(() => {
    const onFitModeChange = () => refitToView(image);
    window.addEventListener("reckon:canvas-fit-mode", onFitModeChange);
    return () => window.removeEventListener("reckon:canvas-fit-mode", onFitModeChange);
  }, [refitToView, image]);

  // Returns a point transformer for a 90° rotation of an image W×H.
  // Points are in image-pixel space; rotation pivots around the image centre.
  const makePointTransformer = useCallback(
    (delta: number, imgW: number, imgH: number) => {
      // Normalise delta to 90 / 180 / 270
      const norm = ((delta % 360) + 360) % 360;
      return (p: { x: number; y: number }) => {
        if (norm === 90)  return { x: imgH - p.y, y: p.x };
        if (norm === 180) return { x: imgW - p.x, y: imgH - p.y };
        if (norm === 270) return { x: p.y, y: imgW - p.x };
        return p;
      };
    },
    []
  );

  const hasMeasurementsOnPage = useCallback(
    (page: number) =>
      takeoffItems.some((item) =>
        item.measurements.some(
          (m) => (m.planId ?? activePlanId) === activePlanId && m.page === page
        )
      ),
    [takeoffItems, activePlanId]
  );

  const hasMeasurementsOnAnyPage = useCallback(
    () =>
      takeoffItems.some((item) =>
        item.measurements.some((m) => (m.planId ?? activePlanId) === activePlanId)
      ),
    [takeoffItems, activePlanId]
  );

  const handleRotatePage = useCallback(
    async (delta: number) => {
      const hasMarkups = hasMeasurementsOnPage(currentPage);
      if (hasMarkups) {
        const ok = await confirm({
          title: "Rotate page with drawings?",
          message: (
            <p className="text-sm text-gray-600">
              This page has measurements drawn on it. They will be rotated to match
              the new orientation. This cannot be undone.
            </p>
          ),
          confirmLabel: "Rotate & move drawings",
          variant: "danger",
        });
        if (!ok) return;
      }
      // Use natural PDF dimensions so the rotation math is in the same coordinate
      // space as stored points (pdfNaturalWidth-based, not render-quality-based).
      const dims = pdfNaturalSize ?? (image ? { width: image.width, height: image.height } : null);
      const transformer = dims
        ? makePointTransformer(delta, dims.width, dims.height)
        : undefined;
      rotatePage(currentPage, delta, transformer);
    },
    [confirm, currentPage, hasMeasurementsOnPage, image, pdfNaturalSize, makePointTransformer, rotatePage]
  );

  const handleRotateAllPages = useCallback(
    async (delta: number) => {
      const hasMarkups = hasMeasurementsOnAnyPage();
      if (hasMarkups) {
        const ok = await confirm({
          title: "Rotate all pages with drawings?",
          message: (
            <p className="text-sm text-gray-600">
              Some pages have measurements drawn on them. All drawings will be
              rotated to match the new orientation. This cannot be undone.
            </p>
          ),
          confirmLabel: "Rotate all & move drawings",
          variant: "danger",
        });
        if (!ok) return;
      }
      // For batch rotation we need the image dimensions per page.
      // We only have the current page's image loaded; for other pages we pass
      // no transformer (they'll rotate correctly on next load since pdfjs
      // re-renders them rotated, and they have no loaded measurements in memory
      // that need transforming — the store transform handles the point coords).
      const dims = pdfNaturalSize ?? (image ? { width: image.width, height: image.height } : null);
      if (dims) {
        const transformsByPage: Record<number, (p: { x: number; y: number }) => { x: number; y: number }> = {};
        for (let p = 1; p <= numPages; p++) {
          // All pages share natural PDF dimensions for typical construction sets.
          // For mixed-orientation PDFs this is best-effort on non-current pages.
          transformsByPage[p] = makePointTransformer(delta, dims.width, dims.height);
        }
        rotateAllPages(delta, transformsByPage);
      } else {
        rotateAllPages(delta);
      }
    },
    [confirm, hasMeasurementsOnAnyPage, image, pdfNaturalSize, makePointTransformer, numPages, rotateAllPages]
  );

  useEffect(() => {
    registerUploadHandler(handleFileUpload);
  }, [registerUploadHandler, handleFileUpload]);

  // Rerender current page whenever its rotation changes
  useEffect(() => {
    if (hasLoadedPlan) rerenderCurrentPage();
  }, [currentRotation]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    getSnappedPoint,
    getAngleSnappedPoint,
    formatDistance,
    formatArea,
    calculateAreaFromPoints,
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
    pdfSegmentIndexRef,
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

  // Handle canvas click
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isPanningMode) return;

    // Click-away to dismiss. A measuring session ends when the user clicks
    // Click-away to dismiss: only when NO drawing tool is active. While a tool
    // is active, every canvas click places a measurement point (that's how you
    // draw), so we must never treat it as a dismiss — otherwise the first click
    // of a new measurement would cancel the session instead of starting it.
    if (boqTargeting && !activeTool && !calibrationMode && !isSelectMode) {
      exitBoqTargeting();
      return;
    }

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
      if (snapped) point = snapped.point;
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

    // This page hasn't been calibrated — quantities would be meaningless,
    // so block drawing entirely rather than recording an uncalibrated
    // measurement the user would have to redo later.
    if (currentScale == null) {
      setUncalibratedWarning(true);
      return;
    }

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
          strokeWidth: 2,
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
          strokeWidth: 2,
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
      // Unified linear: always accumulate points. Finish is explicit
      // (dbl-click / Enter / right-click / click-near-first-vertex on ≥4 pts).
      let nextPoint = point;
      if (currentPoints.length > 0 && isShiftPressed) {
        nextPoint = getAngleSnappedPoint(
          point,
          currentPoints[currentPoints.length - 1]
        );
      }

      // Closing a linear run near the first vertex makes a CLOSED PERIMETER,
      // not an area. The measurement stays a polyline and its quantity is the
      // total boundary length (all segments including the closing edge back to
      // the start). Users tracing a perimeter with the linear tool expect a
      // length in metres, not an enclosed area in m² — the old behavior silently
      // turned this into a type:"area" measurement.
      const closeSnapRadius = 12 / stageScale;
      if (
        currentPoints.length >= 3 &&
        calculateDistance(nextPoint, currentPoints[0]) < closeSnapRadius
      ) {
        // Append the first point so the outline visually closes and the closing
        // edge is included in the perimeter length.
        const closedPoints = [...currentPoints, currentPoints[0]];
        const perimeter = calculateQuantity(closedPoints, "polyline", currentScale);
        const confidence = currentScale
          ? Math.min(1.0, perimeter / (currentScale * 10))
          : 0.5;
        const closeMeasurement: Measurement = {
          id: generateClientId(),
          points: closedPoints,
          quantity: perimeter,
          planId: activePlanId,
          page: currentPage,
          type: "polyline",
          color: activeColor,
          // Apply the toolbar width at creation (same as the dbl-click finish)
          // so a shape closed by joining the first vertex isn't stuck at the
          // default and needing a select-and-edit afterwards.
          strokeWidth:
            currentScale != null ? Math.max(activeRealWidth * currentScale, 2) : 2,
          metadata: {
            createdAt: now,
            lastModified: now,
            confidence: Math.max(0.1, confidence),
          },
        };
        const validation = validateMeasurement(closeMeasurement, "polyline");
        if (validation.isValid) {
          addMeasurement(canvasItemId, closeMeasurement);
          setCurrentPoints([]);
        } else {
          console.warn("Invalid measurement:", validation.error);
        }
        return;
      }

      // Reject stutter clicks: any new vertex within ~8 screen pixels of
      // the previous one is treated as an accidental double-click. Converts
      // screen threshold to image-pixel space so it feels the same at any zoom.
      const effectiveScale = stageScale * (imageScale > 0 ? imageScale : 1);
      const clickSep = MIN_CLICK_SEPARATION_SCREEN / effectiveScale;
      if (
        currentPoints.length > 0 &&
        calculateDistance(
          currentPoints[currentPoints.length - 1],
          nextPoint
        ) < clickSep
      ) {
        return;
      }

      setCurrentPoints([...currentPoints, nextPoint]);
    } else if (activeTool === "area") {
      let finalPoint = point;
      if (currentPoints.length > 0 && isShiftPressed) {
        finalPoint = getAngleSnappedPoint(
          point,
          currentPoints[currentPoints.length - 1]
        );
      }

      // Deduction entry is explicit-only: right-click on an area → "Add deduction".
      // We used to also auto-detect "click inside an existing area" but a
      // very large existing polygon (e.g. accidentally-drawn ~1M m²) would
      // silently swallow every subsequent new area drawing. Explicit entry
      // is unambiguous and matches user expectation.

      // Auto-close when clicking near the first vertex (snap radius in screen px)
      const closeSnapRadius = 12 / stageScale;
      if (
        currentPoints.length >= 3 &&
        calculateDistance(finalPoint, currentPoints[0]) < closeSnapRadius
      ) {
        if (deductionTarget) {
          // Finalize the deduction against its target measurement.
          const validation = validateDeductions(
            (() => {
              const it = takeoffItems.find((i) => i.id === deductionTarget.itemId);
              const m = it?.measurements.find((mm) => mm.id === deductionTarget.measurementId);
              return m?.points ?? [];
            })(),
            [[...currentPoints]]
          );
          if (validation.isValid) {
            addDeductionToMeasurement(deductionTarget.itemId, deductionTarget.measurementId, [
              ...currentPoints,
            ]);
            setCurrentPoints([]);
            setDeductionTarget(null);
          } else {
            console.warn("Invalid deduction:", validation.error);
          }
          return;
        }

        // Standard area auto-close.
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
          // Apply the toolbar width at creation (see polyline close above).
          strokeWidth:
            currentScale != null ? Math.max(activeRealWidth * currentScale, 2) : 2,
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
        } else {
          console.warn("Invalid measurement:", validation.error);
        }
        return;
      }

      // Same stutter-click guard as the linear branch.
      const effectiveScale = stageScale * (imageScale > 0 ? imageScale : 1);
      const clickSep = MIN_CLICK_SEPARATION_SCREEN / effectiveScale;
      if (
        currentPoints.length > 0 &&
        calculateDistance(
          currentPoints[currentPoints.length - 1],
          finalPoint
        ) < clickSep
      ) {
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
      activeRealWidth,
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
      addDeductionToMeasurement,
      deductionTarget,
      takeoffItems,
      updateTakeoffItem,
      setSelectedMeasurement,
      setCalibrationPoint1,
      setCurrentPoints,
      stageSize,
      image,
      imageScale,
      boqTargeting,
      exitBoqTargeting,
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

          setScreenPointerPos(pointerPosition);

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
          setSnappedPoint(snapped?.point ?? null);
          setIsPdfSnap(snapped?.isPdfSnap ?? false);
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

  // Handle double click / Enter / right-click to finish the current run.
  //
  // Linear tool (unified): <2 points discards silently; exactly 2 → 'linear';
  // ≥3 → 'polyline'. Area tool: needs ≥3 points to close.
  const handleDblClick = useCallback(() => {
    if (!activePlanId) return;
    const now = new Date().toISOString();

    if (activeTool === "linear") {
      if (currentPoints.length < 2) {
        setCurrentPoints([]);
        return;
      }
      const type: TakeoffMode = currentPoints.length >= 3 ? "polyline" : "linear";
      const qty = calculateQuantity(currentPoints, type, currentScale);
      const lineLength = calculateDistance(
        currentPoints[0],
        currentPoints[currentPoints.length - 1]
      );
      const confidence = currentScale
        ? Math.min(1.0, lineLength / (currentScale * 10))
        : 0.5;
      const measurement: Measurement = {
        id: generateClientId(),
        points: [...currentPoints],
        quantity: qty,
        planId: activePlanId,
        page: currentPage,
        type,
        color: activeColor,
        strokeWidth:
          currentScale != null ? Math.max(activeRealWidth * currentScale, 2) : 2,
        metadata: {
          createdAt: now,
          lastModified: now,
          confidence: Math.max(0.1, confidence),
        },
      };
      const validation = validateMeasurement(measurement, type);
      if (validation.isValid) {
        addMeasurement(ensureCanvasItemId(), measurement);
        setCurrentPoints([]);
      } else {
        console.warn("Invalid measurement:", validation.error);
      }
      return;
    }

    if (activeTool === "area" && currentPoints.length > 2) {
      // Finalize an in-progress deduction if deduction-mode is active.
      if (deductionTarget) {
        const targetItem = takeoffItems.find((i) => i.id === deductionTarget.itemId);
        const targetM = targetItem?.measurements.find(
          (mm) => mm.id === deductionTarget.measurementId
        );
        if (targetM) {
          const validation = validateDeductions(targetM.points, [[...currentPoints]]);
          if (validation.isValid) {
            addDeductionToMeasurement(
              deductionTarget.itemId,
              deductionTarget.measurementId,
              [...currentPoints]
            );
            setCurrentPoints([]);
            setDeductionTarget(null);
          } else {
            console.warn("Invalid deduction:", validation.error);
          }
        }
        return;
      }

      const area = calculateAreaFromPoints(currentPoints);
      const pixelArea = calculateArea(currentPoints);
      const confidence = currentScale
        ? Math.min(1.0, pixelArea / (currentScale * currentScale * 100))
        : 0.5;

      const measurement: Measurement = {
        id: generateClientId(),
        points: [...currentPoints],
        quantity: area,
        planId: activePlanId,
        page: currentPage,
        type: activeTool,
        color: activeColor,
        // Apply the toolbar width at creation (matches the other finish paths).
        strokeWidth:
          currentScale != null ? Math.max(activeRealWidth * currentScale, 2) : 2,
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
    activeRealWidth,
    ensureCanvasItemId,
    currentPoints,
    calculateAreaFromPoints,
    currentPage,
    addMeasurement,
    addDeductionToMeasurement,
    deductionTarget,
    takeoffItems,
    currentScale,
    setCurrentPoints,
  ]);

  // Handle context menu (right-click).
  //  1. Drawing in progress → finalize current run (mirrors dbl-click / Enter).
  //  2. Hovered/selected area, no drawing → open area context menu
  //     (Add deduction / Remove last deduction / Duplicate / Delete).
  //  3. Otherwise → let the native browser menu through.
  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (currentPoints.length > 0) {
        e.evt.preventDefault();
        handleDblClick();
        return;
      }
      const target = hoveredMeasurement ?? selectedMeasurement;
      if (target) {
        const item = takeoffItems.find((i) => i.id === target.itemId);
        const m = item?.measurements.find(
          (mm) => mm.id === target.measurementId
        );
        if (m && item && getMeasurementType(m, item) === "area") {
          e.evt.preventDefault();
          setAreaContextMenu({
            itemId: target.itemId,
            measurementId: target.measurementId,
            x: e.evt.clientX,
            y: e.evt.clientY,
          });
        }
      }
    },
    [
      handleDblClick,
      currentPoints.length,
      hoveredMeasurement,
      selectedMeasurement,
      takeoffItems,
    ]
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
      } else if (mType === "polyline" && measurement.points.length >= 2) {
        anchor =
          measurement.points[
            pointIndex === 0 ? 1 : pointIndex - 1
          ];
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
      } else if (mType === "polyline" && measurement.points.length >= 2) {
        anchor =
          measurement.points[
            pointIndex === 0 ? 1 : pointIndex - 1
          ];
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

    // Recalculate quantity — dragging never changes point count, so type stays the same.
    let newQuantity = measurement.quantity;
    if (mType === "linear" && updatedPoints.length === 2) {
      newQuantity = calculateQuantity(updatedPoints, "linear", currentScale);
    } else if (mType === "polyline" && updatedPoints.length >= 2) {
      newQuantity = calculateQuantity(updatedPoints, "polyline", currentScale);
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
    // Polylines are open — never wrap the last edge back to the first vertex.
    const isOpen = mType === "polyline";
    const idx2 = isOpen
      ? edgeIndex + 1
      : (edgeIndex + 1) % measurement.points.length;
    if (idx2 >= measurement.points.length) return;

    const p1 = updatedPoints[idx1];
    const p2 = updatedPoints[idx2];

    let effectiveDelta = delta;

    // Acrobat-style: Constrain movement to be perpendicular to the edge (normal vector)
    // unless Shift is pressed for free translation
      if (!isShiftPressed && (mType === "area" || mType === "polyline")) {
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
    } else if (mType === "polyline" && updatedPoints.length >= 2) {
      newQuantity = calculateQuantity(updatedPoints, "polyline", currentScale);
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

  // Spacebar-hold pan: mirror the Figma / Photoshop convention. Holding
  // Space temporarily activates pan; releasing restores whatever mode was
  // active. spacePanRef stores the pre-hold state so we can restore accurately.
  const spacePanRef = useRef<
    | { active: false }
    | { active: true; prevPanning: boolean }
  >({ active: false });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bare-letter/editing shortcuts (f/m/v, Delete, Backspace, arrows)
      // must not hijack keystrokes meant for a focused text field — e.g.
      // typing "f" in a Description would otherwise zoom the canvas and
      // swallow the letter. Escape and Ctrl/Cmd combos stay active even
      // while typing since they don't conflict with normal text entry.
      const target = e.target as HTMLElement | null;
      const isTypingInField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        // Escape works even while a text field has focus — the takeoff input
        // auto-focuses during measuring, so gating on isTypingInField made
        // Escape a no-op mid-session. Fields that own their Escape (rename
        // input, unit combobox, calibration dialog) call stopPropagation.
        // Staged Escape, most-local first:
        // 1) Abandon the in-progress run / transient UI (points not yet a
        //    shape, deduction draw, calibration, context menu).
        const hasTransient =
          currentPoints.length > 0 ||
          deductionTarget !== null ||
          areaContextMenu !== null ||
          calibrationMode ||
          pendingCalibration !== null;
        if (hasTransient) {
          setCurrentPoints([]);
          setDeductionTarget(null);
          setAreaContextMenu(null);
          setCalibrationMode(false);
          setCalibrationPoint1(null);
          setPendingCalibration(null);
          return;
        }
        // 2) End the measuring session but KEEP the staged value (same stash
        //    as click-away) — Escape must never wipe the measurements already
        //    accumulated in the takeoff box. Removing entries is an explicit
        //    act (chip ✕ / editing the input), not a keypress side effect.
        if (boqTargeting) {
          exitBoqTargeting();
          return;
        }
        // 3) Put the active tool down.
        if (activeTool) {
          onFinishTool();
        }
        return;
      }
      if (isTypingInField) return;
      // Hold-space to pan. First keydown remembers current pan state and
      // switches to pan; subsequent auto-repeats do nothing. Key-up restores.
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (!spacePanRef.current.active) {
          spacePanRef.current = {
            active: true,
            prevPanning: isPanningMode,
          };
          if (!isPanningMode) setIsPanningMode(true);
        }
        return;
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
        // Match the pan button: turning pan ON disables any active measuring
        // tool (and select/calibration), so pan and measuring are never both
        // armed. Turning pan OFF leaves the tools cleared.
        setIsPanningMode((p) => {
          const next = !p;
          if (next) {
            setIsSelectMode(false);
            setCalibrationMode(false);
            setActiveTool(null);
            setCurrentPoints([]);
          }
          return next;
        });
      }
      if (e.key.toLowerCase() === "v") {
        // Mirror the select button: turning select ON disables any active
        // measuring tool (and pan/calibration), so select and measuring are
        // never both armed.
        setIsSelectMode((p) => {
          const next = !p;
          if (next) {
            setIsPanningMode(false);
            setCalibrationMode(false);
            setActiveTool(null);
            setCurrentPoints([]);
          }
          return next;
        });
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
      if (e.key === " " || e.code === "Space") {
        const state = spacePanRef.current;
        if (state.active) {
          spacePanRef.current = { active: false };
          setIsPanningMode(state.prevPanning);
        }
      }
    };

    // If the window loses focus while space is held, keyup never fires —
    // recover by clearing the space-held state and restoring the prev mode.
    const handleBlur = () => {
      const state = spacePanRef.current;
      if (state.active) {
        spacePanRef.current = { active: false };
        setIsPanningMode(state.prevPanning);
      }
      setIsShiftPressed(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
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
    boqTargeting,
    exitBoqTargeting,
    cancelBoqTargeting,
    isPanningMode,
    // Staged-Escape reads: without these the stages act on stale state.
    activeTool,
    areaContextMenu,
    calibrationMode,
    deductionTarget,
    onFinishTool,
    pendingCalibration,
  ]);

  // Keep at least a margin of the plan on screen in every direction, so panning
  // feels the same up/down/left/right and the plan can never fully escape the
  // view. Symmetric — fixes the old asymmetry where up (pan) was unbounded but
  // down (scroll) was clamped. The Fit button recenters if needed.
  const clampStagePos = useCallback(
    (pos: { x: number; y: number }, scaleOverride?: number) => {
      const viewW = containerRef.current?.offsetWidth ?? stageSize.width;
      const viewH = containerRef.current?.offsetHeight ?? stageSize.height;
      // Wheel/pinch zoom applies a BRAND-NEW scale in the same tick, so it
      // passes that scale here. Clamping against the old React-state scale
      // computed bounds for the previous zoom level and yanked the view back
      // — which is why zoom buttons (which never move stagePos) felt fine
      // while trackpad/pinch zoom snapped.
      const effScale = scaleOverride ?? stageScale;
      const contentW = stageSize.width * effScale;
      const contentH = stageSize.height * effScale;
      // Desktop-takeoff feel: the plan can pan freely across a large gray
      // workspace and its edges can reach — and go past — the opposite viewport
      // edges. Bounds are expressed so the content's bottom edge can travel all
      // the way to the viewport top (and vice-versa), plus a slack margin on
      // each side, while always keeping a small sliver on screen.
      const slackX = viewW;
      const slackY = viewH;
      const keep = 60; // min sliver that must stay visible at an edge
      // x: from "content fully panned left (right edge near view left)" to
      // "content fully panned right (left edge near view right)", + slack.
      const minX = Math.min(keep, viewW) - contentW - slackX;
      const maxX = (viewW - Math.min(keep, viewW)) + slackX;
      // y: allow the content's TOP to sit at the view BOTTOM (pos = viewH),
      // and the content's BOTTOM to sit at the view TOP (pos = -contentH),
      // each extended by slack. This lets the plan's bottom reach the bottom.
      const minY = -contentH + Math.min(keep, viewH) - slackY;
      const maxY = viewH - Math.min(keep, viewH) + slackY;
      return {
        x: clamp(pos.x, minX, maxX),
        y: clamp(pos.y, Math.min(minY, maxY), Math.max(minY, maxY)),
      };
    },
    [containerRef, stageSize.width, stageSize.height, stageScale]
  );

  // Handle zoom
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.12;
    const stage = e.target.getStage();
    if (!stage) return;
    // Anchor the zoom to the stage node's LIVE position/scale, not React
    // state. State lags the node during/right after a drag (and across stale
    // event closures) — computing from a stale stagePos made a just-panned
    // view snap back on the next wheel tick.
    const oldScale = stage.scaleX() || stageScale;
    const oldPos = stage.position();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Trackpad pinch arrives as a wheel event with ctrlKey set, and its
    // deltaY carries the pinch magnitude — so scale proportionally instead of
    // applying the fixed wheel step, which made pinch feel coarse/jumpy.
    const isPinch = e.evt.ctrlKey;
    const newScale = isPinch
      ? oldScale * Math.exp(-e.evt.deltaY / 100)
      : e.evt.deltaY < 0
        ? oldScale * scaleBy
        : oldScale / scaleBy;
    const clampedScale = Math.max(0.2, Math.min(20, newScale));

    // Zoom to cursor position
    const mousePointTo = {
      x: (pointer.x - oldPos.x) / oldScale,
      y: (pointer.y - oldPos.y) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    setStageScale(clampedScale);
    // Clamp against the NEW scale, not the stale state one.
    setStagePos(clampStagePos(newPos, clampedScale));
    },
    [stageScale, setStageScale, setStagePos, clampStagePos]
  );

  // Compute the base ("nothing hovered") cursor for current mode.
  const computeBaseCursor = useCallback((): string => {
    if (isPanningMode) return "move";
    if (isSelectMode) return "default";
    if (calibrationMode || activeTool) return "crosshair";
    return "crosshair";
  }, [isPanningMode, isSelectMode, calibrationMode, activeTool]);

  // Restore base cursor — called from onMouseLeave handlers when hover ends.
  const resetCursor = useCallback(
    (container: HTMLDivElement | undefined | null) => {
      if (!container) return;
      container.style.cursor = computeBaseCursor();
    },
    [computeBaseCursor]
  );

  // Update cursor dynamically when mode changes.
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;
    container.style.cursor = computeBaseCursor();
  }, [computeBaseCursor, stageRef]);

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

  // PlanSwift-style hover tooltip: instead of an inline dimension label
  // baked into the line, show the value in a small floating box that
  // follows the cursor while hovering any measurement. If the cursor is
  // over a specific deduction, show "−{area}" for that cutout instead.
  const hoverTooltipText = useMemo(() => {
    if (hoveredDeduction) {
      const item = takeoffItems.find((i) => i.id === hoveredDeduction.itemId);
      const measurement = item?.measurements.find(
        (m) => m.id === hoveredDeduction.measurementId
      );
      const deduction = measurement?.deductions?.[hoveredDeduction.index];
      if (deduction && deduction.length >= 3) {
        const pixelArea = calculateArea(deduction);
        const area =
          currentScale && currentScale > 0
            ? pixelArea / (currentScale * currentScale)
            : pixelArea;
        return `−${formatArea(area)}`;
      }
    }
    if (!hoveredMeasurement) return null;
    const item = takeoffItems.find((i) => i.id === hoveredMeasurement.itemId);
    const measurement = item?.measurements.find(
      (m) => m.id === hoveredMeasurement.measurementId
    );
    if (!item || !measurement) return null;
    const mType = getMeasurementType(measurement, item);
    if (mType === "linear" && measurement.points.length === 2) {
      return formatDistance(
        calculateQuantity(measurement.points, "linear", currentScale)
      );
    }
    if (mType === "polyline" && measurement.points.length >= 2) {
      return formatDistance(
        calculateQuantity(measurement.points, "polyline", currentScale)
      );
    }
    if (mType === "area" && measurement.points.length >= 3) {
      return formatArea(
        calculateQuantity(
          measurement.points,
          "area",
          currentScale,
          measurement.deductions ?? []
        )
      );
    }
    return null;
  }, [hoveredDeduction, hoveredMeasurement, takeoffItems, currentScale]);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden min-h-0">
      <CanvasToolbar
        calibrationMode={calibrationMode}
        currentScale={currentScale}
        activeTool={activeToolProp ?? activeTool}
        activeColor={activeColorProp ?? activeColor}
        activeRealWidth={
          selectedMeasurementShape && currentScale && currentScale > 0
            ? (selectedMeasurementShape.strokeWidth ?? 2) / currentScale
            : activeRealWidthLive
        }
        selectedMeasurementId={selectedMeasurement?.measurementId ?? null}
        onSelectTool={onSelectTool}
        onFinishTool={onFinishTool}
        onColorChange={(color) => {
          // Mirror the width control: with a measurement selected, recolor
          // THAT measurement (per-measurement color overrides the item color
          // — getMeasurementColor reads m.color ?? item.color, and the sync
          // diff already ships color changes). With nothing selected, keep
          // the old behaviour: set the default color for new measurements.
          if (selectedMeasurement) {
            const item = takeoffItems.find((i) => i.id === selectedMeasurement.itemId);
            const m = item?.measurements.find((mm) => mm.id === selectedMeasurement.measurementId);
            if (item && m) {
              const updatedMeasurements = item.measurements.map((measurement) =>
                measurement.id === m.id ? { ...measurement, color } : measurement
              );
              updateTakeoffItem(item.id, { measurements: updatedMeasurements });
              return;
            }
          }
          onColorChange(color);
        }}
        onRealWidthChange={(w) => {
          if (selectedMeasurement && currentScale && currentScale > 0) {
            const item = takeoffItems.find((i) => i.id === selectedMeasurement.itemId);
            const m = item?.measurements.find((m) => m.id === selectedMeasurement.measurementId);
            if (item && m) {
              const newStrokeWidth = Math.max(w * currentScale, 2);
              const updatedMeasurements = item.measurements.map((measurement) =>
                measurement.id === m.id
                  ? { ...measurement, strokeWidth: newStrokeWidth }
                  : measurement
              );
              updateTakeoffItem(item.id, { measurements: updatedMeasurements });
            }
          } else {
            useTakeoffStore.setState({ activeRealWidth: w });
          }
        }}
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
        onRotateCW={() => handleRotatePage(90)}
        onRotateCCW={() => handleRotatePage(-90)}
        onRotateAllCW={() => handleRotateAllPages(90)}
        onRotateAllCCW={() => handleRotateAllPages(-90)}
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
        imageDisplaySize={pdfDisplaySize}
        regionPatch={regionPatch}
        onStageClick={handleStageClick}
        onStageDblClick={handleDblClick}
        onStageMouseMove={handleMouseMove}
        onStageWheel={handleWheel}
        onStageContextMenu={handleContextMenu}
        onStageDragEnd={(e) => {
            if (e.target === e.target.getStage()) {
              const clamped = clampStagePos({ x: e.target.x(), y: e.target.y() });
              // Snap the Konva node to the clamped position too, so the visual
              // matches the state (otherwise it can drift past the margin).
              e.target.position(clamped);
              setStagePos(clamped);
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
                  const mStroke = m.strokeWidth ?? 2;
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
                    const isSelected =
                      selectedMeasurement?.itemId === item.id &&
                      selectedMeasurement?.measurementId === m.id;
                    const isHovered =
                      hoveredMeasurement?.itemId === item.id &&
                      hoveredMeasurement?.measurementId === m.id;

                    return (
                      <Group
                        key={m.id}
                        // While a deduction is being drawn, no measurement may
                        // intercept pointer events, or hovering fires the "view
                        // value" state and its hit region swallows the first draw
                        // click (forcing a second). Falling through to the stage
                        // draw handler makes the deduction draw on the first click.
                        listening={!deductionTarget}
                        draggable={isSelectMode}
                        onDragStart={(e) => {
                          if (e.target !== e.currentTarget) return;
                          setIsDraggingObject(true);
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "grabbing";
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
                          resetCursor(e.target.getStage()?.container());
                        }}
                        onClick={(e) => {
                          if (activeTool || calibrationMode || isPanningMode) return;
                          if (!isSelectMode) return;
                          e.cancelBubble = true;
                          setSelectedMeasurement({
                            itemId: item.id,
                            measurementId: m.id,
                          });
                        }}
                        onMouseEnter={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) {
                            const isSel =
                              selectedMeasurement?.itemId === item.id &&
                              selectedMeasurement?.measurementId === m.id;
                            container.style.cursor = isSel ? "move" : "pointer";
                          }
                          setHoveredMeasurement({
                            itemId: item.id,
                            measurementId: m.id,
                          });
                        }}
                        onMouseLeave={(e) => {
                          resetCursor(e.target.getStage()?.container());
                          setHoveredMeasurement(null);
                        }}
                      >
                        {/* Selection highlight — hidden mid-drag to keep the plan visible. */}
                        {isSelected && !(dragging?.itemId === item.id && dragging?.measurementId === m.id) && (
                          <Line
                            points={[p1.x, p1.y, p2.x, p2.y]}
                            stroke={mColor}
                            strokeWidth={mStroke * 3.5 * strokeScale}
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
                        ) : (
                          <Line
                            points={[p1.x, p1.y, p2.x, p2.y]}
                            stroke={mColor}
                            strokeWidth={(isSelected || isHovered ? mStroke * 1.5 : mStroke) * strokeScale}
                            opacity={isSelected || isHovered ? 0.8 : 0.6}
                          />
                        )}
                        {/* No inline dimension label — distance shows in a
                            floating tooltip on hover instead (see the
                            cursor-following box rendered outside Konva). */}

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
                              resetCursor(e.target.getStage()?.container());
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
                            const ringRadius = (isHovered ? 6 : 4.5) * labelScale;
                            const ringStroke = 1.75 * labelScale;
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
                                {/* Hollow endpoint ring — thick colored stroke, white fill.
                                    PlanSwift-style so vertices are legible against the plan. */}
                                <Circle
                                  listening={false}
                                  x={p.x}
                                  y={p.y}
                                  radius={ringRadius}
                                  stroke={mColor}
                                  strokeWidth={ringStroke}
                                  fill="#ffffff"
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
                                    resetCursor(e.target.getStage()?.container());
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
                    const isSelected =
                      selectedMeasurement?.itemId === item.id &&
                      selectedMeasurement?.measurementId === m.id;
                    const isHovered =
                      hoveredMeasurement?.itemId === item.id &&
                      hoveredMeasurement?.measurementId === m.id;
                    const flatPoints = displayPoints.flatMap((p) => [p.x, p.y]);
                    return (
                      <Group
                        key={m.id}
                        // While a deduction is being drawn, no measurement may
                        // intercept pointer events, or hovering fires the "view
                        // value" state and its hit region swallows the first draw
                        // click (forcing a second). Falling through to the stage
                        // draw handler makes the deduction draw on the first click.
                        listening={!deductionTarget}
                        draggable={isSelectMode}
                        onDragStart={(e) => {
                          if (e.target !== e.currentTarget) return;
                          setIsDraggingObject(true);
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "grabbing";
                        }}
                        ref={(node) => {
                          if (isSelected && node) {
                            selectedShapeRef.current = node;
                          }
                        }}
                        onDragEnd={(e) => {
                          const group = e.currentTarget;
                          if (e.target === e.currentTarget && isSelectMode) {
                            const offset = { x: group.x(), y: group.y() };
                            handleMeasurementDrag(item.id, m.id, offset);
                          }
                          setIsDraggingObject(false);
                          group.position({ x: 0, y: 0 });
                          resetCursor(e.target.getStage()?.container());
                        }}
                        onClick={(e) => {
                          if (activeTool || calibrationMode || isPanningMode) return;
                          if (!isSelectMode) return;
                          e.cancelBubble = true;
                          setSelectedMeasurement({
                            itemId: item.id,
                            measurementId: m.id,
                          });
                        }}
                        onMouseEnter={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) {
                            const isSel =
                              selectedMeasurement?.itemId === item.id &&
                              selectedMeasurement?.measurementId === m.id;
                            container.style.cursor = isSel ? "move" : "pointer";
                          }
                          setHoveredMeasurement({
                            itemId: item.id,
                            measurementId: m.id,
                          });
                        }}
                        onMouseLeave={(e) => {
                          resetCursor(e.target.getStage()?.container());
                          setHoveredMeasurement(null);
                        }}
                      >
                        {/* Invisible thick hit-line so clicks anywhere along
                            the polyline register, not just on-pixel. */}
                        <Line
                          points={flatPoints}
                          stroke="rgba(0,0,0,0.001)"
                          strokeWidth={15 * strokeScale}
                          lineJoin="round"
                          lineCap="round"
                        />
                        {/* Selection halo */}
                        {isSelected && (
                          <Line
                            points={flatPoints}
                            stroke={mColor}
                            strokeWidth={mStroke * 3 * strokeScale}
                            opacity={0.22}
                            lineJoin="round"
                            lineCap="round"
                            listening={false}
                          />
                        )}
                        {/* Visible line */}
                        <Line
                          points={flatPoints}
                          stroke={mColor}
                          strokeWidth={(isSelected || isHovered ? mStroke * 1.5 : mStroke) * strokeScale}
                          opacity={isSelected || isHovered ? 0.9 : 0.75}
                          lineJoin="round"
                          lineCap="round"
                          listening={false}
                        />
                        {displayPoints.map((p, i) => (
                          <Circle
                            key={i}
                            x={p.x}
                            y={p.y}
                            radius={4.5 * strokeScale}
                            fill="#ffffff"
                            stroke={mColor}
                            strokeWidth={1.75 * strokeScale}
                            listening={false}
                          />
                        ))}
                        {/* Per-edge hit lines for segment translation — only
                            N-1 edges since the polyline is open. */}
                        {isSelected &&
                          displayPoints.slice(0, -1).map((p1, edgeIdx) => {
                            const p2 = displayPoints[edgeIdx + 1];
                            const isEdgeHovered =
                              hoveredEdge?.itemId === item.id &&
                              hoveredEdge?.measurementId === m.id &&
                              hoveredEdge?.edgeIndex === edgeIdx;
                            return (
                              <Group key={`edge-hit-${edgeIdx}`}>
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
                                    handleEdgeDrag(item.id, m.id, edgeIdx, delta);
                                    e.target.position({ x: 0, y: 0 });
                                  }}
                                  onDragEnd={() => setIsDraggingObject(false)}
                                  onMouseEnter={(e) => {
                                    setHoveredEdge({
                                      itemId: item.id,
                                      measurementId: m.id,
                                      edgeIndex: edgeIdx,
                                    });
                                    const container = e.target
                                      .getStage()
                                      ?.container();
                                    if (container) container.style.cursor = "move";
                                  }}
                                  onMouseLeave={(e) => {
                                    setHoveredEdge(null);
                                    resetCursor(e.target.getStage()?.container());
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
                    const isSelected =
                      selectedMeasurement?.itemId === item.id &&
                      selectedMeasurement?.measurementId === m.id;
                    const isHovered =
                      hoveredMeasurement?.itemId === item.id &&
                      hoveredMeasurement?.measurementId === m.id;

                    return (
                      <Group
                        key={m.id}
                        // While a deduction is being drawn, no measurement may
                        // intercept pointer events, or hovering fires the "view
                        // value" state and its hit region swallows the first draw
                        // click (forcing a second). Falling through to the stage
                        // draw handler makes the deduction draw on the first click.
                        listening={!deductionTarget}
                        draggable={isSelectMode}
                        onDragStart={(e) => {
                          if (e.target !== e.currentTarget) return;
                          setIsDraggingObject(true);
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "grabbing";
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
                          resetCursor(e.target.getStage()?.container());
                        }}
                        onClick={(e) => {
                          if (activeTool || calibrationMode || isPanningMode) return;
                          if (!isSelectMode) return;
                          e.cancelBubble = true;
                          setSelectedMeasurement({
                            itemId: item.id,
                            measurementId: m.id,
                          });
                        }}
                        onMouseEnter={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) {
                            const isSel =
                              selectedMeasurement?.itemId === item.id &&
                              selectedMeasurement?.measurementId === m.id;
                            container.style.cursor = isSel ? "move" : "pointer";
                          }
                          setHoveredMeasurement({
                            itemId: item.id,
                            measurementId: m.id,
                          });
                        }}
                        onMouseLeave={(e) => {
                          resetCursor(e.target.getStage()?.container());
                          setHoveredMeasurement(null);
                        }}
                      >
                        {m.deductions && m.deductions.length > 0 && (
                          // Invisible hit area so clicks / hover still register
                          // on the punched shape (Shape below is non-listening).
                          <Line
                            points={displayPoints.flatMap((p) => [p.x, p.y])}
                            fill="rgba(0,0,0,0.001)"
                            closed
                          />
                        )}
                        {m.deductions && m.deductions.length > 0 ? (
                          <Shape
                            sceneFunc={(ctx) => {
                              // Punch deductions via evenodd fill: outer + all
                              // deduction paths in one Path2D, then fill('evenodd').
                              // Stroke separately so the fill rule doesn't
                              // affect the outer boundary stroke.
                              const path = new Path2D();
                              displayPoints.forEach((p, i) => {
                                if (i === 0) path.moveTo(p.x, p.y);
                                else path.lineTo(p.x, p.y);
                              });
                              path.closePath();
                              (m.deductions ?? []).forEach((d) => {
                                d.forEach((p, i) => {
                                  if (i === 0) path.moveTo(p.x, p.y);
                                  else path.lineTo(p.x, p.y);
                                });
                                path.closePath();
                              });
                              const native = (ctx as unknown as {
                                _context: CanvasRenderingContext2D;
                              })._context;
                              native.fillStyle = mColor + "44";
                              native.fill(path, "evenodd");
                              const strokePath = new Path2D();
                              displayPoints.forEach((p, i) => {
                                if (i === 0) strokePath.moveTo(p.x, p.y);
                                else strokePath.lineTo(p.x, p.y);
                              });
                              strokePath.closePath();
                              native.strokeStyle = mColor;
                              native.lineWidth =
                                (isSelected || isHovered ? mStroke * 2 : mStroke) *
                                strokeScale;
                              native.stroke(strokePath);
                            }}
                            opacity={isHovered ? 0.8 : 1}
                            listening={false}
                          />
                        ) : (
                          <Line
                            points={displayPoints.flatMap((p) => [p.x, p.y])}
                            stroke={mColor}
                            strokeWidth={(isSelected || isHovered ? mStroke * 2 : mStroke) * strokeScale}
                            fill={mColor + "44"}
                            opacity={isHovered ? 0.8 : 1}
                            closed
                          />
                        )}
                        {/* Deduction strokes — dashed to distinguish from outer boundary.
                            Interactive so hover shows a "−{area}" tooltip. */}
                        {m.deductions?.map((d, di) => {
                          const isDedHovered =
                            hoveredDeduction?.itemId === item.id &&
                            hoveredDeduction?.measurementId === m.id &&
                            hoveredDeduction?.index === di;
                          return (
                            <React.Fragment key={`deduction-${di}`}>
                              {/* Visible dashed outline */}
                              <Line
                                points={d.flatMap((p) => [p.x, p.y])}
                                stroke={mColor}
                                strokeWidth={(isDedHovered ? mStroke * 2 : mStroke) * strokeScale}
                                dash={[6 * strokeScale, 4 * strokeScale]}
                                opacity={isDedHovered ? 1 : 0.8}
                                closed
                                listening={false}
                              />
                              {/* Invisible thicker fill for hit-testing */}
                              <Line
                                points={d.flatMap((p) => [p.x, p.y])}
                                fill="rgba(0,0,0,0.001)"
                                closed
                                onMouseEnter={(e) => {
                                  setHoveredDeduction({
                                    itemId: item.id,
                                    measurementId: m.id,
                                    index: di,
                                  });
                                  const container = e.target
                                    .getStage()
                                    ?.container();
                                  if (container) container.style.cursor = "pointer";
                                }}
                                onMouseLeave={(e) => {
                                  setHoveredDeduction(null);
                                  resetCursor(e.target.getStage()?.container());
                                }}
                              />
                            </React.Fragment>
                          );
                        })}
                        {/* Selection highlight */}
                        {isSelected && (
                          <Line
                            points={displayPoints.flatMap((p) => [p.x, p.y])}
                            stroke={mColor}
                            strokeWidth={mStroke * 4 * strokeScale}
                            opacity={0.3}
                            closed
                            listening={false}
                          />
                        )}
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
                                    resetCursor(e.target.getStage()?.container());
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

                    return (
                      <React.Fragment key={m.id}>
                        {m.points.map((p, idx) => {
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
                        // While a deduction is being drawn, no measurement may
                        // intercept pointer events, or hovering fires the "view
                        // value" state and its hit region swallows the first draw
                        // click (forcing a second). Falling through to the stage
                        // draw handler makes the deduction draw on the first click.
                          listening={!deductionTarget}
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
                            if (activeTool || calibrationMode || isPanningMode) return;
                          if (!isSelectMode) return;
                            e.cancelBubble = true;
                            setSelectedMeasurement({
                              itemId: item.id,
                              measurementId: m.id,
                            });
                          }}
                          onMouseEnter={(e) => {
                            const container = e.target.getStage()?.container();
                            if (container) {
                              const isSel =
                                selectedMeasurement?.itemId === item.id &&
                                selectedMeasurement?.measurementId === m.id;
                              container.style.cursor = isSel ? "move" : "pointer";
                            }
                            setHoveredMeasurement({
                              itemId: item.id,
                              measurementId: m.id,
                            });
                          }}
                          onMouseLeave={(e) => {
                            resetCursor(e.target.getStage()?.container());
                            setHoveredMeasurement(null);
                          }}
                        />
                      );
                    })}
                      </React.Fragment>
                    );
                  }
                  return null;
                })
            )}

            {/* Draggable vertices in select mode (area + polyline).
                Linear/count have dedicated drag handles above. */}
            {isSelectMode &&
              takeoffItems.map((item) =>
              item.measurements
                  .filter(
          (m) => measurementBelongsToPlan(m, activePlanId) && m.page === currentPage && !m.hidden
        )
                  .filter((m) => {
                    const t = getMeasurementType(m, item);
                    return t === "area" || t === "polyline";
                  })
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
                        radius={(isHovered ? 6 : 5) * strokeScale}
                        // Solid fill only on hover of THIS vertex — selection
                        // of the whole measurement is signaled by the halo
                        // behind the line, not by filling every point.
                        fill={isHovered ? mColor : "#ffffff"}
                        stroke={mColor}
                        strokeWidth={(isHovered ? 2.5 : 2) * strokeScale}
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
                          if (container) container.style.cursor = "crosshair";
                          setHoveredPoint({
                            itemId: item.id,
                            measurementId: m.id,
                            pointIndex: idx,
                          });
                        }}
                        onMouseLeave={(e) => {
                          resetCursor(e.target.getStage()?.container());
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

        </>}
        draftChildren={<>
            {/* Render current drawing points */}
            {currentPoints.length > 0 && activeTool && (() => {
              const drawColor = deductionTarget ? "#ef4444" : activeColor;
              return (
              <>
                {currentPoints.map((p, i) => {
                  const isFirst = i === 0 && activeTool === "area" && currentPoints.length >= 3;
                  // Check if cursor is near the first point (for close-area highlight)
                  const closeSnapRadius = 12 / stageScale;
                  const nearClose = isFirst && mousePos && calculateDistance(mousePos, p) < closeSnapRadius;
                  // PlanSwift-style hollow ring: thick colored stroke, white fill.
                  const ringRadius = (isFirst && nearClose ? 8 : 5) * labelScale;
                  const ringStroke = 2 * labelScale;
                  return (
                    <Group key={i}>
                      <Circle
                        x={p.x}
                        y={p.y}
                        radius={ringRadius}
                        stroke={drawColor}
                        strokeWidth={ringStroke}
                        fill={isFirst && nearClose ? drawColor : "#ffffff"}
                        listening={false}
                      />
                    </Group>
                  );
                })}
                {currentPoints.length > 1 && (
                  <Line
                    points={currentPoints.flatMap((p) => [p.x, p.y])}
                    stroke={drawColor}
                    strokeWidth={2 * strokeScale}
                    dash={[5 * strokeScale, 5 * strokeScale]}
                  />
                )}
              </>
              );
            })()}

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
                    if (snapped) previewPoint = snapped.point;
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
                  if (snapped) previewPoint = snapped.point;
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
                  stroke={isPdfSnap ? "#2196F3" : "#FF6B00"}
                  strokeWidth={2 * labelScale}
                  fill={isPdfSnap ? "rgba(33, 150, 243, 0.12)" : "rgba(255, 107, 0, 0.12)"}
                />
                <Circle
                  x={snappedPoint.x}
                  y={snappedPoint.y}
                  radius={2 * labelScale}
                  fill={isPdfSnap ? "#2196F3" : "#FF6B00"}
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
                  cx = p.point.x;
                  cy = p.point.y;
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
        overlayChildren={
          hoveredMeasurement && hoverTooltipText && screenPointerPos ? (
            <div
              className="absolute z-30 pointer-events-none rounded-md bg-gray-900/90 px-2 py-1 text-xs font-semibold text-white shadow-lg"
              style={{
                left: screenPointerPos.x + 14,
                top: screenPointerPos.y + 14,
              }}
            >
              {hoverTooltipText}
            </div>
          ) : null
        }
      />

      {uncalibratedWarning && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-red-600 text-white px-3 py-1.5 shadow-lg text-xs font-semibold">
          <span>Calibrate this page before taking measurements</span>
        </div>
      )}

      {/* No "measuring mode" banner: measurements finish on double-click and
          the toolbox dismisses on click-outside, so there's no lingering mode
          to advertise. */}

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
        onFit={() => refitToView(image)}
      />
      {(() => {
        // Slim status pill — top-center of viewport. Only appears when a
        // tool that benefits from hints is armed (linear / area / deduction).
        // Suppressed while a BOQ measuring session is active — the orange
        // "Measuring for..." pill occupies the same slot and takes priority.
        if (boqTargeting) return null;
        let text: string | null = null;
        let accent = "bg-gray-800/85";
        if (calibrationMode) {
          text = "Calibration — click two points, then enter the real distance";
          accent = "bg-orange-600/90";
        } else if (deductionTarget && activeTool === "area") {
          text = "Deducting — double-click / Enter to finish, Esc to cancel";
          accent = "bg-red-600/90";
        } else if (activeTool === "linear") {
          text = "Linear — click points, double-click / Enter to finish";
        } else if (activeTool === "area") {
          text = "Area — click points, double-click / Enter to close";
        } else if (activeTool === "count") {
          text = "Count — click each item, Esc to finish";
        }
        if (!text) return null;
        return (
          <div
            className={`absolute top-16 left-1/2 -translate-x-1/2 z-20 ${accent} backdrop-blur text-white px-3 py-1.5 rounded-full shadow-lg text-[11px] font-medium tracking-wide max-w-[420px] text-center pointer-events-none whitespace-nowrap`}
          >
            {text}
          </div>
        );
      })()}
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
      {areaContextMenu && (() => {
        const item = takeoffItems.find((i) => i.id === areaContextMenu.itemId);
        const m = item?.measurements.find((mm) => mm.id === areaContextMenu.measurementId);
        const deductionCount = m?.deductions?.length ?? 0;
        return (
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setAreaContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setAreaContextMenu(null);
              }}
            />
            <div
              className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[180px] text-sm"
              style={{ left: areaContextMenu.x, top: areaContextMenu.y }}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedMeasurement({
                    itemId: areaContextMenu.itemId,
                    measurementId: areaContextMenu.measurementId,
                  });
                  setDeductionTarget({
                    itemId: areaContextMenu.itemId,
                    measurementId: areaContextMenu.measurementId,
                  });
                  setCurrentPoints([]);
                  // Set the tool directly — NOT via onSelectTool, which is a
                  // TOGGLE. When the user is already measuring with the area
                  // tool (the normal case for a deduction), the toggle turned
                  // the tool OFF, so the first Deduct click deactivated
                  // measuring and a second right-click → Deduct was needed to
                  // toggle it back on. setActiveTool is idempotent.
                  setActiveTool("area");
                  setAreaContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 cursor-pointer"
              >
                Deduct
              </button>
              <button
                type="button"
                disabled={deductionCount === 0}
                onClick={() => {
                  if (deductionCount === 0) return;
                  removeDeductionFromMeasurement(
                    areaContextMenu.itemId,
                    areaContextMenu.measurementId,
                    deductionCount - 1
                  );
                  setAreaContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Remove last deduction {deductionCount > 0 ? `(${deductionCount})` : ''}
              </button>
              <div className="h-px bg-gray-200 my-1" />
              <button
                type="button"
                onClick={() => {
                  removeMeasurement(
                    areaContextMenu.itemId,
                    areaContextMenu.measurementId
                  );
                  setSelectedMeasurement(null);
                  setAreaContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 cursor-pointer"
              >
                Delete area
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
};

export default FloorPlanCanvas;
