import React from "react";
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  Move,
  MousePointer2,
  Undo2,
  RotateCcw,
  Magnet,
} from "lucide-react";

interface CanvasOverlaysProps {
  stageScale: number;
  setStageScale: (scale: number) => void;
  pdfDocLoaded: boolean;
  numPages: number;
  currentPage: number;
  currentScale: number | null;
  isPanningMode: boolean;
  isSelectMode: boolean;
  isShiftPressed: boolean;
  onChangePage: (delta: number) => void;
  onTogglePan: () => void;
  onToggleSelect: () => void;
  onUndoPoint: () => void;
  onClearAll: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
}

const CanvasOverlays: React.FC<CanvasOverlaysProps> = ({
  stageScale,
  setStageScale,
  pdfDocLoaded,
  numPages,
  currentPage,
  currentScale,
  isPanningMode,
  isSelectMode,
  isShiftPressed,
  onChangePage,
  onTogglePan,
  onToggleSelect,
  onUndoPoint,
  onClearAll,
  snapEnabled,
  onToggleSnap,
}) => {
  return (
    <>
      {/* Floating edit tools — top right */}
      <div className="absolute top-20 right-4 flex items-center gap-px bg-white/85 backdrop-blur-sm py-1 px-1 rounded-lg shadow-md border border-gray-200/60 z-20">
        <button
          type="button"
          onClick={onTogglePan}
          title="Pan (M)"
          className={`p-1.5 rounded-md transition cursor-pointer ${
            isPanningMode ? "bg-secondary text-white" : "hover:bg-gray-100 text-gray-500"
          }`}
        >
          <Move className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToggleSelect}
          title="Select (V)"
          className={`p-1.5 rounded-md transition cursor-pointer ${
            isSelectMode ? "bg-secondary text-white" : "hover:bg-gray-100 text-gray-500"
          }`}
        >
          <MousePointer2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToggleSnap}
          title={snapEnabled ? 'Snap: on' : 'Snap: off'}
          className={`p-1.5 rounded-md transition cursor-pointer ${
            snapEnabled ? "bg-secondary text-white" : "hover:bg-gray-100 text-gray-500"
          }`}
        >
          <Magnet className="w-4 h-4" />
        </button>
        <div className="h-4 w-px bg-gray-200 mx-0.5" />
        <button
          type="button"
          onClick={onUndoPoint}
          className="p-1.5 hover:bg-gray-100 rounded-md transition cursor-pointer text-gray-500"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onClearAll}
          className="p-1.5 hover:bg-red-50 rounded-md transition cursor-pointer text-red-400"
          title="Clear all"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Zoom — bottom right */}
      <div className="absolute bottom-6 right-4 flex items-center gap-px bg-white/85 backdrop-blur-sm py-1 px-1 rounded-lg shadow-md border border-gray-200/60 z-20">
        <button
          type="button"
          onClick={() => {
            const newScale = Math.min(20, stageScale * 1.12);
            setStageScale(newScale);
          }}
          className="p-1.5 hover:bg-gray-100 rounded-md cursor-pointer"
        >
          <ZoomIn className="w-4 h-4 text-gray-600" />
        </button>
        <button
          type="button"
          onClick={() => {
            const newScale = Math.max(0.05, stageScale / 1.12);
            setStageScale(newScale);
          }}
          className="p-1.5 hover:bg-gray-100 rounded-md cursor-pointer"
        >
          <ZoomOut className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {pdfDocLoaded && numPages > 0 && (
        <div className="absolute bottom-6 left-6 flex items-center space-x-4 bg-white/80 backdrop-blur p-2 rounded-xl shadow-xl border border-white/50 z-20">
          <button
            type="button"
            onClick={() => onChangePage(-1)}
            disabled={currentPage === 1}
            className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
            type="button"
            onClick={() => onChangePage(1)}
            disabled={currentPage === numPages}
            className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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

      {isSelectMode && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-4 py-2 rounded-full shadow-lg z-20 text-xs font-bold uppercase tracking-widest border-2 border-white">
          Select Mode Active - Drag Points (large) or Edges (small)
        </div>
      )}

      {isShiftPressed && !isSelectMode && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-blue-600/80 backdrop-blur text-white px-4 py-2 rounded-full shadow-lg z-20 text-xs font-bold uppercase tracking-widest">
          Precision Mode Active (Snapped)
        </div>
      )}

      {isSelectMode && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-gray-800/85 backdrop-blur text-white px-4 py-2 rounded-full shadow-lg z-20 text-[11px] font-semibold tracking-wide">
          Arrow keys nudge. Alt = fine, Shift = coarse (scale-aware when calibrated).
        </div>
      )}
    </>
  );
};

export default CanvasOverlays;
