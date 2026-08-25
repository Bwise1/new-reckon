import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import type { Point } from "@/types/takeoff";

interface CanvasStatusBarProps {
  numPages: number;
  currentPage: number;
  onChangePage: (delta: number) => void;
  planName: string;
  /** Calibration: display-bitmap px per meter for the current page, or null. */
  currentScale: number | null;
  stageScale: number;
  setStageScale: (scale: number) => void;
  onFit: () => void;
  autoScrollEnabled: boolean;
  onToggleAutoScroll: () => void;
  /** Cursor position in display-bitmap px (image space), or null when outside. */
  mousePos: Point | null;
}

/** zz-style compact toggle chip: `Label : On`. */
const ToggleChip: React.FC<{
  label: string;
  on: boolean;
  onClick: () => void;
  title: string;
}> = ({ label, on, onClick, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`px-1.5 py-0.5 rounded border text-[11px] font-medium transition-colors cursor-pointer ${
      on
        ? "border-gray-300 bg-gray-100 text-gray-800"
        : "border-gray-200 bg-white text-gray-400 hover:text-gray-600"
    }`}
  >
    {label} : {on ? "On" : "Off"}
  </button>
);

const Divider: React.FC = () => <span className="h-3 w-px bg-gray-200" />;

/**
 * Thin technical status strip under the canvas: page navigation, plan name,
 * calibration state, drafting toggles, zoom, and a live cursor read-out.
 * Replaces the floating page/calibration and zoom pills.
 */
const CanvasStatusBar: React.FC<CanvasStatusBarProps> = ({
  numPages,
  currentPage,
  onChangePage,
  planName,
  currentScale,
  stageScale,
  setStageScale,
  onFit,
  autoScrollEnabled,
  onToggleAutoScroll,
  mousePos,
}) => {
  const cursorText = mousePos
    ? currentScale && currentScale > 0
      ? `X: ${(mousePos.x / currentScale).toFixed(2)}m, Y: ${(mousePos.y / currentScale).toFixed(2)}m`
      : `X: ${Math.round(mousePos.x)}, Y: ${Math.round(mousePos.y)}`
    : "X: –, Y: –";

  return (
    <div className="shrink-0 flex flex-nowrap items-center gap-2.5 overflow-hidden whitespace-nowrap border-t border-gray-200 bg-white px-3 py-1 text-[11px] font-medium text-gray-500 select-none">
      {/* Page navigation */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Previous page"
          title="Previous page"
          disabled={currentPage <= 1}
          onClick={() => onChangePage(-1)}
          className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="tabular-nums">
          Page {currentPage} of {Math.max(numPages, 1)}
        </span>
        <button
          type="button"
          aria-label="Next page"
          title="Next page"
          disabled={currentPage >= numPages}
          onClick={() => onChangePage(1)}
          className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {planName && (
        <>
          <Divider />
          <span className="hidden md:block truncate max-w-48" title={planName}>
            {planName}
          </span>
        </>
      )}

      <Divider />
      <span
        className={`inline-flex items-center gap-1 ${
          currentScale ? "text-green-700" : "text-red-500"
        }`}
      >
        {currentScale ? (
          <Check className="h-3 w-3" strokeWidth={2.5} />
        ) : (
          <AlertCircle className="h-3 w-3" />
        )}
        {currentScale ? `Scale: 1:${currentScale.toFixed(1)}` : "Not Scaled"}
      </span>

      <span className="flex-1" />

      {/* Drafting toggles, zz-style */}
      <ToggleChip
        label="Auto Scroll"
        on={autoScrollEnabled}
        onClick={onToggleAutoScroll}
        title="Pan the sheet automatically when the cursor reaches the edge while measuring"
      />

      <Divider />

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => setStageScale(Math.max(0.2, stageScale / 1.12))}
          className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-gray-100 hover:text-gray-800 cursor-pointer"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="w-10 text-center tabular-nums">
          {Math.round(stageScale * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => setStageScale(Math.min(20, stageScale * 1.12))}
          className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-gray-100 hover:text-gray-800 cursor-pointer"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Fit plan to view"
          title="Fit plan to view"
          onClick={onFit}
          className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-gray-100 hover:text-gray-800 cursor-pointer"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Divider />

      <span className="hidden lg:block tabular-nums min-w-32 text-right">{cursorText}</span>
    </div>
  );
};

export default CanvasStatusBar;
