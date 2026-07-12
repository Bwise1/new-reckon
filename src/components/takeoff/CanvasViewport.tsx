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
  onStageClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onStageDblClick: () => void;
  onStageMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onStageWheel: (e: Konva.KonvaEventObject<WheelEvent>) => void;
  onStageContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onStageDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  measurementsChildren: React.ReactNode;
  draftChildren: React.ReactNode;
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
  onStageClick,
  onStageDblClick,
  onStageMouseMove,
  onStageWheel,
  onStageContextMenu,
  onStageDragEnd,
  measurementsChildren,
  draftChildren,
}) => {
  return (
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
          {image && <KonvaImage image={image} scaleX={imageScale} scaleY={imageScale} />}
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
    </div>
  );
};

export default CanvasViewport;

