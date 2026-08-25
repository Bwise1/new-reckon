import React from "react";
import {
  Move,
  MousePointer2,
  Undo2,
  RotateCcw,
  Magnet,
} from "lucide-react";

interface CanvasOverlaysProps {
  isPanningMode: boolean;
  isSelectMode: boolean;
  isShiftPressed: boolean;
  onTogglePan: () => void;
  onToggleSelect: () => void;
  onUndoPoint: () => void;
  onClearAll: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
}

const CanvasOverlays: React.FC<CanvasOverlaysProps> = ({
  isPanningMode,
  isSelectMode,
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

      {/* All three floating banners (Select Mode Active, Precision Mode
          Active, Arrow keys nudge…) are commented out — they overlapped the
          calibration pill / zoom controls and duplicated info already
          visible from the toolbar state and on-canvas crosshair.
          Re-enable individually if the affordance is missed.
      {isSelectMode && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 bg-gray-800/85 backdrop-blur text-white px-4 py-2 rounded-full shadow-lg z-20 text-[11px] font-semibold tracking-wide">
          Arrow keys nudge. Alt = fine, Shift = coarse (scale-aware when calibrated).
        </div>
      )}
      */}
    </>
  );
};

export default CanvasOverlays;
