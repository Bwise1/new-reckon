import React from "react";
import { Stage, Layer, Group, Image as KonvaImage, Rect } from "react-konva";
import type Konva from "konva";

interface CanvasViewportProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<Konva.Stage | null>;
  stageSize: { width: number; height: number };
  stageScale: number;
  stagePos: { x: number; y: number };
  isPanningMode: boolean;
  isDraggingObject: boolean;
  image: HTMLImageElement | null;
  imageScale: number;
  /** For PDF plans: the fixed pixel box the bitmap is drawn into. Stored
   *  measurement coords are in this space, so it must not follow the
   *  bitmap's own resolution — a sharper re-render keeps the same box.
   *  null/undefined (raster plans) falls back to the image's natural size. */
  imageDisplaySize?: { width: number; height: number } | null;
  onStageClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onStageDblClick: () => void;
  onStageMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onStageWheel: (e: Konva.KonvaEventObject<WheelEvent>) => void;
  onStageContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onStageDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  measurementsChildren: React.ReactNode;
  draftChildren: React.ReactNode;
  /** Plain HTML overlay (e.g. the hover tooltip), rendered as a sibling of
   * the Stage so it can be positioned with CSS in raw stage/screen pixels. */
  overlayChildren?: React.ReactNode;
}

const CanvasViewport: React.FC<CanvasViewportProps> = ({
  containerRef,
  stageRef,
  stageSize,
  stageScale,
  stagePos,
  isPanningMode,
  isDraggingObject,
  image,
  imageScale,
  imageDisplaySize,
  onStageClick,
  onStageDblClick,
  onStageMouseMove,
  onStageWheel,
  onStageContextMenu,
  onStageDragEnd,
  measurementsChildren,
  draftChildren,
  overlayChildren,
}) => {
  return (
    <div
      id="canvas-container"
      ref={containerRef}
      // overflow-hidden (not auto): the plan is moved by Konva pan (stagePos),
      // clamped symmetrically in all directions. With overflow-auto, browser
      // scroll competed with pan and only bounded the bottom, causing the
      // "free up, limited down" asymmetry.
      className="flex-1 bg-gray-200 relative overflow-hidden"
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        pixelRatio={window.devicePixelRatio || 1}
        draggable={isPanningMode && !isDraggingObject}
        onClick={onStageClick}
        onDblClick={onStageDblClick}
        onMouseMove={onStageMouseMove}
        onWheel={onStageWheel}
        onContextMenu={onStageContextMenu}
        onDragEnd={onStageDragEnd}
      >
        {/* Layer 1: static background — never redraws after plan load */}
        <Layer listening={false}>
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
              width={imageDisplaySize?.width}
              height={imageDisplaySize?.height}
            />
          )}
        </Layer>

        {/* Layer 2: finalized measurements — points stored in image-pixel space,
            rendered here via a single imageScale transform so nothing drifts when
            the container width changes across devices. */}
        <Layer>
          <Group scaleX={imageScale} scaleY={imageScale}>
            {measurementsChildren}
          </Group>
        </Layer>

        {/* Layer 3: in-progress drawing + snap indicators — redraws on every mouse move */}
        <Layer listening={false}>
          <Group scaleX={imageScale} scaleY={imageScale}>
            {draftChildren}
          </Group>
        </Layer>
      </Stage>
      {overlayChildren}
    </div>
  );
};

export default CanvasViewport;
