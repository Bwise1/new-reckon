import React, { useState, useRef, useEffect, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text, Group, Rect } from "react-konva";
import { ZoomIn, ZoomOut, Move, Ruler, FileUp, ChevronLeft, ChevronRight, Scissors, Undo2, RotateCcw, MousePointer2, Check, AlertCircle } from "lucide-react";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import SaveIndicator from "@/components/ui/SaveIndicator";
import type { TakeoffMode, Point, Measurement } from "@/types/takeoff";
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const SNAP_THRESHOLD = 25; // Increased for easier snapping

const FloorPlanCanvas: React.FC = () => {
  const stageRef = useRef<any>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  const [isPanningMode, setIsPanningMode] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isDeductionMode, setIsDeductionMode] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [snappedPoint, setSnappedPoint] = useState<Point | null>(null);
  const [selectedMeasurement, setSelectedMeasurement] = useState<{itemId: string, measurementId: string} | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{itemId: string, measurementId: string, pointIndex: number} | null>(null);

  const [calibrationPoint1, setCalibrationPoint1] = useState<Point | null>(null);
  const [calibrationDistance, setCalibrationDistance] = useState<string>("");

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);

  const {
    takeoffItems,
    activeItemId,
    scales,
    calibrationLines,
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
  } = useTakeoffStore();

  const currentScale = scales[currentPage] || null;
  const activeItem = takeoffItems.find(i => i.id === activeItemId);

  // Handle window resize
  useEffect(() => {
    const updateSize = () => {
      const container = document.getElementById('canvas-container');
      if (container) {
        setStageSize({
          width: container.offsetWidth,
          height: container.offsetHeight
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Snap to existing vertices
  const getSnappedVertex = useCallback((point: Point): Point | null => {
    let nearest: Point | null = null;
    let minDist = Infinity;

    // Check existing measurements
    takeoffItems.forEach(item => {
      item.measurements
        .filter(m => m.page === currentPage)
        .forEach(m => {
          m.points.forEach(p => {
            const dist = Math.sqrt(Math.pow(point.x - p.x, 2) + Math.pow(point.y - p.y, 2));
            if (dist < SNAP_THRESHOLD && dist < minDist) {
              minDist = dist;
              nearest = p;
            }
          });
        });
    });

    // Check current points
    currentPoints.forEach(p => {
      const dist = Math.sqrt(Math.pow(point.x - p.x, 2) + Math.pow(point.y - p.y, 2));
      if (dist < SNAP_THRESHOLD && dist < minDist) {
        minDist = dist;
        nearest = p;
      }
    });

    return nearest;
  }, [takeoffItems, currentPoints, currentPage]);

  // Snap to angle (horizontal/vertical when Shift pressed)
  const getAngleSnappedPoint = useCallback((point: Point, lastPoint: Point): Point => {
    if (!isShiftPressed) return point;
    const dx = Math.abs(point.x - lastPoint.x);
    const dy = Math.abs(point.y - lastPoint.y);
    // Snap to horizontal or vertical
    if (dx > dy) {
      return { x: point.x, y: lastPoint.y }; // Horizontal
    } else {
      return { x: lastPoint.x, y: point.y }; // Vertical
    }
  }, [isShiftPressed]);

  // Format distance for display
  const formatDistance = useCallback((val: number): string => {
    return `${val.toFixed(2)}m`;
  }, []);

  // Format area for display
  const formatArea = useCallback((val: number): string => {
    return `${Math.abs(val).toFixed(2)} m²`;
  }, []);

  // Calculate area from points
  const calculateArea = useCallback((points: Point[]): number => {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      area += (p1.x * p2.y - p2.x * p1.y);
    }
    const pixelArea = Math.abs(area / 2);
    return currentScale ? pixelArea / (currentScale * currentScale) : pixelArea;
  }, [currentScale]);

  // Handle PDF upload and rendering
  const renderPdfPage = useCallback(async (pdf: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL();

    const img = new window.Image();
    img.src = dataUrl;
    img.onload = () => {
      setImage(img);

      // Calculate dimensions to fit the container width
      const container = document.getElementById('canvas-container');
      if (container) {
        const containerWidth = container.offsetWidth;
        const scaleFactor = containerWidth / img.width;

        // Store the image scale factor
        setImageScale(scaleFactor);

        // Set canvas size to match scaled image dimensions
        setStageSize({
          width: containerWidth,
          height: img.height * scaleFactor
        });

        // Reset stage transformations
        setStageScale(1);
        setStagePos({ x: 0, y: 0 });
      }
    };
  }, []);

  // Handle file upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
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
          const container = document.getElementById('canvas-container');
          if (container) {
            const containerWidth = container.offsetWidth;
            const scaleFactor = containerWidth / img.width;

            // Store the image scale factor
            setImageScale(scaleFactor);

            // Set canvas size to match scaled image dimensions
            setStageSize({
              width: containerWidth,
              height: img.height * scaleFactor
            });

            // Reset stage transformations
            setStageScale(1);
            setStagePos({ x: 0, y: 0 });
          }
        };
      };
      reader.readAsDataURL(file);
    }
  }, [stageSize, renderPdfPage, setCurrentPage, setStoreNumPages]);

  // Handle PDF page navigation
  const changePage = useCallback((delta: number) => {
    if (!pdfDoc) return;
    const newPage = Math.max(1, Math.min(numPages, currentPage + delta));
    if (newPage !== currentPage) {
      setCurrentPage(newPage);
      renderPdfPage(pdfDoc, newPage);
    }
  }, [pdfDoc, numPages, currentPage, renderPdfPage, setCurrentPage]);

  // Handle canvas click
  const handleStageClick = useCallback((e: any) => {
    if (isPanningMode) return;

    // In select mode, clicking on empty space deselects
    if (isSelectMode && e.target === e.target.getStage()) {
      setSelectedMeasurement(null);
      return;
    }

    // Don't allow drawing in select mode
    if (isSelectMode) return;

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    let point = {
      x: (pointerPosition.x - stagePos.x) / stageScale,
      y: (pointerPosition.y - stagePos.y) / stageScale
    };

    // Apply vertex snapping
    const snapped = getSnappedVertex(point);
    if (snapped) point = snapped;

    if (calibrationMode) {
      if (!calibrationPoint1) {
        setCalibrationPoint1(point);
      } else {
        let finalPoint = point;
        if (isShiftPressed) {
          finalPoint = getAngleSnappedPoint(point, calibrationPoint1);
        }
        const dx = finalPoint.x - calibrationPoint1.x;
        const dy = finalPoint.y - calibrationPoint1.y;
        const pixelDist = Math.sqrt(dx * dx + dy * dy);
        const dist = parseFloat(calibrationDistance);
        if (dist > 0) {
          const newScale = pixelDist / dist;
          setScale(currentPage, newScale);
          setCalibrationMode(false);
          setCalibrationPoint1(null);
          setCalibrationLine(currentPage, { p1: calibrationPoint1, p2: finalPoint, distance: dist });
        }
      }
      return;
    }

    if (!activeItem) return;

    if (activeItem.type === "count") {
      const measurement: Measurement = {
        id: Math.random().toString(),
        points: [point],
        quantity: 1,
        page: currentPage
      };
      addMeasurement(activeItem.id, measurement);
    } else if (activeItem.type === "linear") {
      if (currentPoints.length === 0) {
        setCurrentPoints([point]);
      } else {
        const p1 = currentPoints[0];
        let p2 = point;
        if (isShiftPressed) {
          p2 = getAngleSnappedPoint(point, p1);
        }
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const qty = currentScale ? dist / currentScale : dist;
        const measurement: Measurement = {
          id: Math.random().toString(),
          points: [p1, p2],
          quantity: qty,
          page: currentPage
        };
        addMeasurement(activeItem.id, measurement);
        setCurrentPoints([]);
      }
    } else if (activeItem.type === "area") {
      let finalPoint = point;
      if (currentPoints.length > 0 && isShiftPressed) {
        finalPoint = getAngleSnappedPoint(point, currentPoints[currentPoints.length - 1]);
      }
      setCurrentPoints([...currentPoints, finalPoint]);
    }
  }, [isPanningMode, isSelectMode, calibrationMode, calibrationPoint1, calibrationDistance, activeItem, currentPoints, isShiftPressed, stagePos, stageScale, getSnappedVertex, getAngleSnappedPoint, currentScale, currentPage, addMeasurement, setCalibrationMode, setScale, setCalibrationLine]);

  // Handle mouse move for ghost line
  const handleMouseMove = useCallback((e: any) => {
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    const point = {
      x: (pointerPosition.x - stagePos.x) / stageScale,
      y: (pointerPosition.y - stagePos.y) / stageScale
    };

    setMousePos(point);

    // Update snapped point
    const snapped = getSnappedVertex(point);
    setSnappedPoint(snapped);
  }, [stagePos, stageScale, getSnappedVertex]);

  // Handle double click to finish area
  const handleDblClick = useCallback(() => {
    if (activeItem?.type === "area" && currentPoints.length > 2) {
      const area = calculateArea(currentPoints);
      const quantity = isDeductionMode ? -area : area;
      const measurement: Measurement = {
        id: Math.random().toString(),
        points: [...currentPoints],
        quantity,
        page: currentPage
      };
      addMeasurement(activeItem.id, measurement);
      setCurrentPoints([]);
    }
  }, [activeItem, currentPoints, isDeductionMode, calculateArea, currentPage, addMeasurement]);

  // Handle context menu (right-click) to finish measurement
  const handleContextMenu = useCallback((e: any) => {
    e.evt.preventDefault();
    handleDblClick();
  }, [handleDblClick]);

  // Handle point drag to update measurement
  const handlePointDrag = useCallback((itemId: string, measurementId: string, pointIndex: number, newPos: Point) => {
    const item = takeoffItems.find(i => i.id === itemId);
    if (!item) return;

    const measurement = item.measurements.find(m => m.id === measurementId);
    if (!measurement) return;

    // Update the point
    const updatedPoints = [...measurement.points];
    updatedPoints[pointIndex] = newPos;

    // Recalculate quantity
    let newQuantity = measurement.quantity;
    if (item.type === 'linear' && updatedPoints.length === 2) {
      const dx = updatedPoints[1].x - updatedPoints[0].x;
      const dy = updatedPoints[1].y - updatedPoints[0].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      newQuantity = currentScale ? dist / currentScale : dist;
    } else if (item.type === 'area' && updatedPoints.length >= 3) {
      const area = calculateArea(updatedPoints);
      newQuantity = measurement.quantity < 0 ? -area : area; // Preserve deduction
    }

    // Calculate old and new total quantities
    const oldTotal = item.totalQuantity;
    const diff = newQuantity - measurement.quantity;
    const newTotal = oldTotal + diff;

    // Update the item with the new measurement
    const updatedMeasurements = item.measurements.map(m =>
      m.id === measurementId
        ? { ...m, points: updatedPoints, quantity: newQuantity }
        : m
    );

    updateTakeoffItem(itemId, {
      measurements: updatedMeasurements,
      totalQuantity: newTotal
    });
  }, [takeoffItems, currentScale, calculateArea, updateTakeoffItem]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCurrentPoints([]);
        setCalibrationMode(false);
        setCalibrationPoint1(null);
      }
      if (e.key === 'Shift') setIsShiftPressed(true);
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (currentPoints.length > 0) {
          setCurrentPoints(prev => prev.slice(0, -1));
        }
      }
      if (e.key.toLowerCase() === 'm') {
        setIsPanningMode(p => !p);
      }
      if (e.key.toLowerCase() === 'v') {
        setIsSelectMode(p => !p);
      }
      if (e.key.toLowerCase() === 'x') {
        setIsDeductionMode(p => !p);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedMeasurement) {
          e.preventDefault();
          removeMeasurement(selectedMeasurement.itemId, selectedMeasurement.measurementId);
          setSelectedMeasurement(null);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [currentPoints, selectedMeasurement, removeMeasurement, setCalibrationMode]);

  // Handle zoom
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.05;
    const stage = e.target.getStage();
    const oldScale = stageScale;
    const pointer = stage.getPointerPosition();

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
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
  }, [stageScale, stagePos]);

  // Update cursor dynamically
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;

    let cursor = 'default';
    if (isPanningMode) cursor = 'move';
    else if (isSelectMode) cursor = 'pointer';
    else if (calibrationMode || activeItem) cursor = 'crosshair';

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
            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
          </label>

          <div className="h-8 w-px bg-gray-200" />

          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => { setCalibrationMode(!calibrationMode); setCalibrationPoint1(null); }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
                calibrationMode ? 'bg-red-500 text-white animate-pulse' : currentScale ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {currentScale ? <Check className="w-5 h-5" /> : <Ruler className="w-5 h-5" />}
              <span>{calibrationMode ? 'Calibrating...' : currentScale ? 'Calibrated' : 'Calibrate'}</span>
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
            onClick={() => setIsPanningMode(!isPanningMode)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
              isPanningMode ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title="Pan Tool (M)"
          >
            <Move className="w-5 h-5" />
            <span>Pan</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSelectMode(!isSelectMode)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
              isSelectMode ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
              isDeductionMode ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
            onClick={() => setCurrentPoints(prev => prev.length > 0 ? prev.slice(0, -1) : [])}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => { if (confirm("Clear all measurements?")) { /* Reset */ } }}
            className="p-2 hover:bg-red-50 rounded-lg transition"
            title="Clear All"
          >
            <RotateCcw className="w-5 h-5 text-red-500" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div id="canvas-container" className="flex-1 bg-gray-200 relative overflow-auto">
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          draggable={isPanningMode}
          onClick={handleStageClick}
          onDblClick={handleDblClick}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          onDragEnd={(e) => setStagePos({ x: e.target.x(), y: e.target.y() })}
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
            {image && <KonvaImage image={image} scaleX={imageScale} scaleY={imageScale} />}

            {/* Render takeoff items */}
            {takeoffItems.map(item => (
              item.measurements
                .filter(m => m.page === currentPage)
                .map(m => {
                  if (item.type === "linear" && m.points.length === 2) {
                    const p1 = m.points[0];
                    const p2 = m.points[1];
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const angle = Math.atan2(dy, dx);
                    const tickLen = 6;
                    const tickDX = Math.sin(angle) * tickLen;
                    const tickDY = Math.cos(angle) * tickLen;

                    return (
                      <Group key={m.id}>
                        {/* Main line */}
                        <Line points={[p1.x, p1.y, p2.x, p2.y]} stroke={item.color} strokeWidth={2} />
                        {/* Perpendicular ticks */}
                        <Line points={[p1.x - tickDX, p1.y + tickDY, p1.x + tickDX, p1.y - tickDY]} stroke={item.color} strokeWidth={2} />
                        <Line points={[p2.x - tickDX, p2.y + tickDY, p2.x + tickDX, p2.y - tickDY]} stroke={item.color} strokeWidth={2} />
                        {/* Dimension label */}
                        <Text
                          x={(p1.x + p2.x) / 2}
                          y={(p1.y + p2.y) / 2 - 15}
                          text={formatDistance(m.quantity)}
                          fontSize={12}
                          fill={item.color}
                          rotation={angle * (180 / Math.PI)}
                          offsetX={formatDistance(m.quantity).length * 3}
                          offsetY={6}
                        />
                      </Group>
                    );
                  } else if (item.type === "area") {
                    const center = m.points.reduce((acc, p) => ({ x: acc.x + p.x / m.points.length, y: acc.y + p.y / m.points.length }), { x: 0, y: 0 });
                    return (
                      <Group key={m.id}>
                        <Line
                          points={m.points.flatMap(p => [p.x, p.y])}
                          stroke={item.color}
                          strokeWidth={2}
                          fill={m.quantity < 0 ? 'rgba(255,255,255,0.5)' : item.color + '44'}
                          dash={m.quantity < 0 ? [5, 5] : undefined}
                          closed
                        />
                        <Text
                          x={center.x}
                          y={center.y}
                          text={formatArea(m.quantity)}
                          fontSize={14}
                          fontStyle="bold"
                          fill={m.quantity < 0 ? '#ff0000' : item.color}
                          offsetX={formatArea(m.quantity).length * 3.5}
                          offsetY={7}
                        />
                      </Group>
                    );
                  } else if (item.type === "count") {
                    return m.points.map((p, idx) => (
                      <Circle
                        key={`${m.id}-${idx}`}
                        x={p.x}
                        y={p.y}
                        radius={6}
                        fill={item.color}
                        stroke="white"
                        strokeWidth={2}
                      />
                    ));
                  }
                  return null;
                })
            ))}

            {/* Draggable points in select mode */}
            {isSelectMode && takeoffItems.map(item => (
              item.measurements
                .filter(m => m.page === currentPage)
                .flatMap(m => {
                  const isSelected = selectedMeasurement?.itemId === item.id && selectedMeasurement?.measurementId === m.id;
                  return m.points.map((p, idx) => {
                    const isHovered = hoveredPoint?.itemId === item.id && hoveredPoint?.measurementId === m.id && hoveredPoint?.pointIndex === idx;
                    return (
                      <Circle
                        key={`${m.id}-point-${idx}`}
                        x={p.x}
                        y={p.y}
                        radius={isSelected ? 10 : isHovered ? 8 : 6}
                        fill={isSelected ? item.color : isHovered ? item.color : 'white'}
                        stroke={item.color}
                        strokeWidth={isSelected || isHovered ? 3 : 2}
                        draggable={true}
                        onDragEnd={(e) => {
                          const stage = e.target.getStage();
                          const pos = e.target.position();
                          const newPos = {
                            x: pos.x,
                            y: pos.y
                          };
                          handlePointDrag(item.id, m.id, idx, newPos);
                        }}
                        onClick={(e) => {
                          e.cancelBubble = true;
                          setSelectedMeasurement({ itemId: item.id, measurementId: m.id });
                        }}
                        onMouseEnter={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) {
                            container.style.cursor = 'grab';
                          }
                          setHoveredPoint({ itemId: item.id, measurementId: m.id, pointIndex: idx });
                        }}
                        onMouseLeave={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) {
                            container.style.cursor = 'pointer';
                          }
                          setHoveredPoint(null);
                        }}
                        onDragStart={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) {
                            container.style.cursor = 'grabbing';
                          }
                        }}
                        shadowColor={isSelected ? item.color : undefined}
                        shadowBlur={isSelected ? 10 : 0}
                        shadowOpacity={isSelected ? 0.5 : 0}
                      />
                    );
                  });
                })
            ))}

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
                      <Circle x={p.x} y={p.y} radius={2} fill={activeItem.color} />
                    </Group>
                  );
                })}
                {currentPoints.length > 1 && (
                  <Line
                    points={currentPoints.flatMap(p => [p.x, p.y])}
                    stroke={activeItem.color}
                    strokeWidth={2}
                    dash={[5, 5]}
                  />
                )}
              </>
            )}

            {/* Ghost line preview */}
            {mousePos && currentPoints.length > 0 && activeItem && !isPanningMode && (
              <>
                {(activeItem.type === "linear" || activeItem.type === "area") && (() => {
                  const lastPoint = currentPoints[currentPoints.length - 1];
                  let previewPoint = mousePos;

                  // Apply snapping
                  const snapped = getSnappedVertex(mousePos);
                  if (snapped) previewPoint = snapped;
                  else if (isShiftPressed) previewPoint = getAngleSnappedPoint(mousePos, lastPoint);

                  const dx = previewPoint.x - lastPoint.x;
                  const dy = previewPoint.y - lastPoint.y;
                  const angle = Math.atan2(dy, dx);
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const qty = currentScale ? dist / currentScale : dist;
                  const tickLen = 6;
                  const tickDX = Math.sin(angle) * tickLen;
                  const tickDY = Math.cos(angle) * tickLen;

                  return (
                    <Group opacity={0.5}>
                      <Line points={[lastPoint.x, lastPoint.y, previewPoint.x, previewPoint.y]} stroke={activeItem.color} strokeWidth={2} dash={[5, 5]} />
                      <Line points={[lastPoint.x - tickDX, lastPoint.y + tickDY, lastPoint.x + tickDX, lastPoint.y - tickDY]} stroke={activeItem.color} strokeWidth={2} />
                      <Line points={[previewPoint.x - tickDX, previewPoint.y + tickDY, previewPoint.x + tickDX, previewPoint.y - tickDY]} stroke={activeItem.color} strokeWidth={2} />
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
            {calibrationMode && calibrationPoint1 && mousePos && (() => {
              let previewPoint = mousePos;
              if (isShiftPressed) previewPoint = getAngleSnappedPoint(mousePos, calibrationPoint1);

              const dx = previewPoint.x - calibrationPoint1.x;
              const dy = previewPoint.y - calibrationPoint1.y;
              const angle = Math.atan2(dy, dx);
              const dist = Math.sqrt(dx * dx + dy * dy);
              const tickLen = 6;
              const tickDX = Math.sin(angle) * tickLen;
              const tickDY = Math.cos(angle) * tickLen;

              return (
                <Group opacity={0.7}>
                  <Line points={[calibrationPoint1.x, calibrationPoint1.y, previewPoint.x, previewPoint.y]} stroke="red" strokeWidth={2} dash={[5, 5]} />
                  <Line points={[calibrationPoint1.x - tickDX, calibrationPoint1.y + tickDY, calibrationPoint1.x + tickDX, calibrationPoint1.y - tickDY]} stroke="red" strokeWidth={2} />
                  <Line points={[previewPoint.x - tickDX, previewPoint.y + tickDY, previewPoint.x + tickDX, previewPoint.y - tickDY]} stroke="red" strokeWidth={2} />
                </Group>
              );
            })()}

            {/* Render calibration point */}
            {calibrationPoint1 && (
              <Group>
                {/* Horizontal tick mark */}
                <Line
                  points={[calibrationPoint1.x - 8, calibrationPoint1.y, calibrationPoint1.x + 8, calibrationPoint1.y]}
                  stroke="red"
                  strokeWidth={3}
                />
                {/* Small center dot */}
                <Circle x={calibrationPoint1.x} y={calibrationPoint1.y} radius={2} fill="red" />
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
          <button onClick={() => {
            const newScale = Math.min(5, stageScale * 1.1);
            setStageScale(newScale);
          }} className="p-2 hover:bg-gray-100 rounded-lg">
            <ZoomIn className="w-5 h-5" />
          </button>
          <button onClick={() => {
            const newScale = Math.max(0.1, stageScale / 1.1);
            setStageScale(newScale);
          }} className="p-2 hover:bg-gray-100 rounded-lg">
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
              <span className="text-[10px] text-gray-500 uppercase font-bold">Page</span>
              <span className="text-sm font-bold">{currentPage} / {numPages}</span>
            </div>
            <button
              onClick={() => changePage(1)}
              disabled={currentPage === numPages}
              className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="h-8 w-px bg-gray-200" />
            <div className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-bold ${
              currentScale ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {currentScale ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              <span>{currentScale ? `CALIBRATED (1m = ${currentScale.toFixed(1)}px)` : 'UNSCALED'}</span>
            </div>
          </div>
        )}

        {/* Mode indicators */}
        {isSelectMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-4 py-2 rounded-full shadow-lg z-20 text-xs font-bold uppercase tracking-widest border-2 border-white">
            Select Mode Active - Drag Points to Edit
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
