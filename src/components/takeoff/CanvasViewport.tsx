import React, { useLayoutEffect, useState } from "react";
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
  /** Hi-res crop of the plan overlaid on the base bitmap while zoomed in.
   *  Coordinates/size are in display-bitmap px (same space as imageDisplaySize). */
  regionPatch?: {
    image: HTMLImageElement;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
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
  regionPatch,
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
  // The Stage is sized to the PANE, not the plan. stageSize is the sheet
  // (plan aspect box) drawn inside it as the white Rect below — decoupling the
  // two is what lets the sheet pan/zoom past every pane edge instead of the
  // canvas surface ending where the plan ends (grey band below the drawing).
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setViewportSize({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  return (
    <div
      id="canvas-container"
      // Paper, not chrome: the drawing surface stays light in every theme.
      data-theme="light"
      ref={containerRef}
      // overflow-hidden (not auto): the plan is moved by Konva pan (stagePos),
      // clamped symmetrically in all directions. With overflow-auto, browser
      // scroll competed with pan and only bounded the bottom, causing the
      // "free up, limited down" asymmetry.
      className="flex-1 bg-board relative overflow-hidden"
      // Prototype graph-paper backdrop: subtle 24px grid behind the floating
      // sheet, tinted from the overlay token so it follows the theme.
      style={{
        backgroundImage:
          "linear-gradient(var(--color-board-grid) 1px, transparent 1px)," +
          "linear-gradient(90deg, var(--color-board-grid) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <Stage
        ref={stageRef}
        width={viewportSize.width}
        height={viewportSize.height}
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
        {/* Layer 1: static background — never redraws after plan load.
            The Rect is the SHEET (stageSize = plan aspect box), deliberately
            not the pane: it travels with pan/zoom like paper on a desk. */}
        <Layer listening={false}>
{image && (
            <Rect
              x={0}
              y={0}
              width={stageSize.width}
              height={stageSize.height}
              // Konva fills can't resolve CSS vars — literal --color-paper value
              // (theme-constant white; the sheet is a physical page).
              fill="#ffffff"
              shadowColor="black"
              shadowBlur={12}
              shadowOpacity={0.12}
              shadowOffsetY={2}
            />
          )}
          {image && (
            <KonvaImage
              image={image}
              scaleX={imageScale}
              scaleY={imageScale}
              width={imageDisplaySize?.width}
              height={imageDisplaySize?.height}
            />
          )}
          {image && regionPatch && (
            <KonvaImage
              image={regionPatch.image}
              x={regionPatch.x * imageScale}
              y={regionPatch.y * imageScale}
              scaleX={imageScale}
              scaleY={imageScale}
              width={regionPatch.width}
              height={regionPatch.height}
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
