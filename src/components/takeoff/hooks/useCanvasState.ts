import { useRef, useState } from "react";
import type Konva from "konva";
import type * as pdfjsLib from "pdfjs-dist";
import { SpatialIndex } from "@/utils/spatialIndex";
import type { Point } from "@/types/takeoff";
import type { TakeoffItem } from "@/types/takeoff";

export interface SelectedMeasurementRef {
  itemId: string;
  measurementId: string;
}

export interface HoveredPointRef extends SelectedMeasurementRef {
  pointIndex: number;
}

export interface HoveredEdgeRef extends SelectedMeasurementRef {
  edgeIndex: number;
}

export interface ActiveDragPointRef extends HoveredPointRef {
  pos: Point;
}

interface UseCanvasStateParams {
  takeoffItems: TakeoffItem[];
  activeItemId: string | null;
  scales: Record<number, number>;
  currentPage: number;
}

export const useCanvasState = ({
  takeoffItems,
  activeItemId,
  scales,
  currentPage,
}: UseCanvasStateParams) => {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedShapeRef = useRef<Konva.Group | null>(null);
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
  const [selectedMeasurement, setSelectedMeasurement] =
    useState<SelectedMeasurementRef | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPointRef | null>(
    null
  );
  const [hoveredMeasurement, setHoveredMeasurement] =
    useState<SelectedMeasurementRef | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdgeRef | null>(null);
  const [activeDragPoint, setActiveDragPoint] =
    useState<ActiveDragPointRef | null>(null);

  const [calibrationPoint1, setCalibrationPoint1] = useState<Point | null>(null);
  const [calibrationDistance, setCalibrationDistance] = useState<string>("");
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);

  const activeItem = takeoffItems.find((i) => i.id === activeItemId);
  const currentScale = scales[currentPage] || null;

  return {
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
    isDeductionMode,
    setIsDeductionMode,
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
    calibrationDistance,
    setCalibrationDistance,
    pdfDoc,
    setPdfDoc,
    numPages,
    setNumPages,
    activeItem,
    currentScale,
  };
};

