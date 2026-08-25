import React, { useState, useRef, useEffect } from 'react';
import { Wand2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { TakeoffMode } from '@/types/takeoff';
import { MARKUP_COLORS, MEASUREMENT_TOOLS } from '@/constants/takeoffDesign';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { useFullscreen } from '@/hooks/useFullscreen';

interface CanvasToolbarProps {
  calibrationMode: boolean;
  currentScale: number | null;
  activeTool: TakeoffMode | null;
  activeColor: string;
  activeRealWidth: number;
  selectedMeasurementId?: string | null;
  onToggleCalibration: () => void;
  onSelectTool: (type: TakeoffMode) => void;
  /** Single-click area detection mode (magic wand). */
  autoAreaMode: boolean;
  onToggleAutoArea: () => void;
  /** Put the active tool down (clicking the active tool button, or Esc). */
  onFinishTool: () => void;
  onColorChange: (color: string) => void;
  onRealWidthChange: (width: number) => void;
  onRotateCW: () => void;
  onRotateCCW: () => void;
  onRotateAllCW: () => void;
  onRotateAllCCW: () => void;
}

function usePortalDropdown() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const inTrigger = triggerRef.current?.contains(e.target as Node);
      const inMenu = menuRef.current?.contains(e.target as Node);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((o) => !o);
  };

  return { open, setOpen, toggle, triggerRef, menuRef, pos };
}

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  calibrationMode,
  currentScale,
  activeTool,
  activeRealWidth,
  selectedMeasurementId,
  onToggleCalibration,
  onSelectTool,
  autoAreaMode,
  onToggleAutoArea,
  onFinishTool,
  onColorChange,
  onRealWidthChange,
  onRotateCW,
  onRotateCCW,
  onRotateAllCW,
  onRotateAllCCW,
}) => {
  const scaleDisplay = currentScale ? `1m = ${currentScale.toFixed(1)}px` : 'Unscaled';

  const liveColor = useTakeoffStore((s) => s.activeColor);
  const fullscreen = useFullscreen();

  // Local input state so the field stays editable mid-type.
  const [widthInput, setWidthInput] = useState(Number(activeRealWidth).toFixed(3));

  // Re-seed when the selection or its width changes. Done during render rather
  // than in an effect so the field never paints a stale value first.
  const widthSeed = `${selectedMeasurementId ?? ''}:${activeRealWidth}`;
  const [seededWidth, setSeededWidth] = useState(widthSeed);
  if (widthSeed !== seededWidth) {
    setSeededWidth(widthSeed);
    setWidthInput(Number(activeRealWidth).toFixed(3));
  }

  const commitWidth = (raw: string) => {
    const parsed = parseFloat(raw);
    if (isFinite(parsed) && parsed > 0) {
      onRealWidthChange(parsed);
    } else {
      setWidthInput(Number(activeRealWidth).toFixed(3));
    }
  };

  // Destructured rather than kept as `color.*`: reading ref properties off an
  // object in JSX trips react-hooks' "cannot access refs during render" rule.
  const {
    open: colorOpen,
    setOpen: setColorOpen,
    toggle: toggleColor,
    triggerRef: colorTriggerRef,
    menuRef: colorMenuRef,
    pos: colorPos,
  } = usePortalDropdown();

  return (
    <div className="shrink-0 px-3 bg-white border-b border-gray-200 flex items-center gap-2 z-10 h-14">

      {/* Calibrate */}
      <div data-tour="calibrate" className="flex items-stretch rounded-lg overflow-hidden border border-gray-200 shadow-sm shrink-0 h-10">
        <button
          type="button"
          onClick={onToggleCalibration}
          className={`px-3 text-sm font-bold transition cursor-pointer h-full ${
            calibrationMode ? 'bg-[#f97316] text-white animate-pulse' : 'bg-[#f97316] text-white hover:bg-[#ea580c]'
          }`}
        >
          {calibrationMode ? 'Calibrating…' : 'Calibrate'}
        </button>
        {!calibrationMode && (
          <span className={`px-3 border-l border-gray-200 text-xs font-semibold tabular-nums min-w-[96px] text-center flex items-center justify-center ${
            currentScale ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {scaleDisplay}
          </span>
        )}
      </div>

      {/* Tools */}
      <div data-tour="tools" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 shadow-sm shrink-0 h-10">
        <span className="text-xs font-medium text-gray-400 mr-0.5">Tools</span>
        {MEASUREMENT_TOOLS.map((tool, index) => {
          const isActive = activeTool === tool.type || (tool.type === 'linear' && activeTool === 'polyline');
          const tooltip = (() => {
            if (isActive) return `${tool.label} — click again or Done to exit`;
            if (tool.type === 'linear')
              return 'Linear — click points; double-click, Enter, or right-click to finish. Click first point (≥4 pts) to close as area.';
            if (tool.type === 'area')
              return 'Area — click points; double-click or Enter to close. Right-click a finished area to deduct.';
            return tool.label;
          })();
          return (
            <React.Fragment key={tool.type}>
              {index > 0 && <div className="w-px h-4 bg-gray-200" />}
              <button
                type="button"
                onClick={() => (isActive ? onFinishTool() : onSelectTool(tool.type))}
                title={tooltip}
                aria-pressed={isActive}
                className={`flex items-center justify-center w-8 h-6 rounded text-sm font-bold transition cursor-pointer outline-none ${
                  isActive ? 'bg-secondary text-white outline-2 outline-secondary/30' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                +<sub className="text-[9px]">{tool.short}</sub>
              </button>
            </React.Fragment>
          );
        })}
        <div className="w-px h-4 bg-gray-200" />
        <button
          type="button"
          onClick={onToggleAutoArea}
          title="Auto area — click once inside a room and its boundary is detected automatically"
          aria-pressed={autoAreaMode}
          className={`flex items-center justify-center w-8 h-6 rounded transition cursor-pointer outline-none ${
            autoAreaMode ? 'bg-secondary text-white outline-2 outline-secondary/30' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />
        </button>
        {/* No "Done" button: a measurement finishes on double-click (or by
            clicking near the first vertex), and clicking outside puts the tool
            down and dismisses the toolbox. */}
      </div>

      {/* Color dropdown */}
      <div className="shrink-0" ref={colorTriggerRef}>
        <button
          type="button"
          onClick={toggleColor}
          title="Markup color"
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 shadow-sm hover:bg-gray-50 transition cursor-pointer h-10"
        >
          <span className="text-xs font-medium text-gray-500">Color</span>
          <div className="w-4 h-4 rounded-full border border-gray-300 shadow-sm" style={{ backgroundColor: liveColor }} />
          <svg className="w-3 h-3 text-gray-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4l4 4 4-4" />
          </svg>
        </button>
      </div>

      {colorOpen && createPortal(
        <div
          ref={colorMenuRef}
          style={{ position: 'fixed', top: colorPos.top, left: colorPos.left, zIndex: 99999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl p-3"
        >
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Markup Color</p>
          <div className="grid grid-cols-4 gap-2">
            {MARKUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onColorChange(c); setColorOpen(false); }}
                className="relative w-8 h-10 rounded-full transition hover:scale-110 cursor-pointer"
                style={{ backgroundColor: c }}
                title={c}
              >
                {liveColor === c && (
                  <svg className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Width input */}
      <div
        className={`flex items-stretch rounded-lg border shadow-sm shrink-0 h-10 overflow-hidden transition-colors ${
          selectedMeasurementId && currentScale
            ? 'border-secondary/50 bg-secondary/5'
            : 'border-gray-200 bg-white'
        }`}
        title={
          selectedMeasurementId && currentScale
            ? 'Edit selected measurement line width'
            : currentScale
            ? 'Line width in metres — scaled to plan calibration'
            : 'Calibrate first to use real-world width'
        }
      >
        <span className={`px-2.5 flex items-center text-xs font-medium border-r border-gray-200 whitespace-nowrap ${
          selectedMeasurementId && currentScale ? 'text-secondary bg-secondary/10' : 'text-gray-500 bg-gray-50'
        }`}>
          {selectedMeasurementId && currentScale ? 'Edit Width' : 'Width'}
        </span>
        <input
          type="number"
          min="0.001"
          step="0.01"
          value={widthInput}
          disabled={!currentScale}
          onChange={(e) => setWidthInput(e.target.value)}
          onBlur={(e) => commitWidth(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className="w-16 px-2 text-sm tabular-nums outline-none bg-transparent disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
        />
        <span className="px-2 flex items-center text-xs text-gray-500 border-l border-gray-200 bg-gray-50">
          m
        </span>
      </div>

      {/* Rotate */}
      <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-2 shadow-sm shrink-0 h-10">
        <span className="text-xs font-medium text-gray-400 mr-1">Rotate</span>
        <button type="button" onClick={onRotateCCW} title="Rotate CCW" className="flex items-center justify-center w-7 h-7 rounded text-gray-600 hover:bg-gray-100 transition cursor-pointer">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
        <button type="button" onClick={onRotateCW} title="Rotate CW" className="flex items-center justify-center w-7 h-7 rounded text-gray-600 hover:bg-gray-100 transition cursor-pointer">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <button type="button" onClick={onRotateAllCCW} title="Rotate all CCW" className="h-7 px-1.5 rounded text-xs font-medium text-gray-600 hover:bg-gray-100 transition cursor-pointer whitespace-nowrap">↺ All</button>
        <button type="button" onClick={onRotateAllCW} title="Rotate all CW" className="h-7 px-1.5 rounded text-xs font-medium text-gray-600 hover:bg-gray-100 transition cursor-pointer whitespace-nowrap">↻ All</button>
      </div>

      {/* Fullscreen toggle */}
      {fullscreen.supported && (
        <button
          type="button"
          onClick={fullscreen.toggle}
          title={fullscreen.isFullscreen ? 'Exit full screen' : 'Full screen'}
          aria-label={fullscreen.isFullscreen ? 'Exit full screen' : 'Full screen'}
          className="shrink-0 ml-auto flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition cursor-pointer"
        >
          {fullscreen.isFullscreen ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v4a1 1 0 0 1-1 1H3M16 3v4a1 1 0 0 0 1 1h4M8 21v-4a1 1 0 0 0-1-1H3M16 21v-4a1 1 0 0 1 1-1h4" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" />
            </svg>
          )}
        </button>
      )}

    </div>
  );
};

export default CanvasToolbar;
