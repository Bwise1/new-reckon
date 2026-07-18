import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { TakeoffMode } from '@/types/takeoff';
import { MARKUP_COLORS, MEASUREMENT_TOOLS } from '@/constants/takeoffDesign';
import { useTakeoffStore } from '@/store/useTakeoffStore';

const STROKE_WIDTHS = [1, 2, 3, 4, 5];

interface CanvasToolbarProps {
  calibrationMode: boolean;
  currentScale: number | null;
  activeTool: TakeoffMode | null;
  activeColor: string;
  activeStrokeWidth: number;
  onToggleCalibration: () => void;
  onSelectTool: (type: TakeoffMode) => void;
  onFinishTool: () => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onRotateCW: () => void;
  onRotateCCW: () => void;
  onRotateAllCW: () => void;
  onRotateAllCCW: () => void;
}

const LinePreview: React.FC<{ width: number; color?: string }> = ({ width, color = '#374151' }) => (
  <svg width="24" height="10" viewBox="0 0 24 10">
    <line x1="2" y1="5" x2="22" y2="5" stroke={color} strokeWidth={Math.min(width, 6)} strokeLinecap="round" />
  </svg>
);

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
  onToggleCalibration,
  onSelectTool,
  onFinishTool,
  onColorChange,
  onStrokeWidthChange,
  onRotateCW,
  onRotateCCW,
  onRotateAllCW,
  onRotateAllCCW,
}) => {
  const scaleDisplay = currentScale ? `1m = ${currentScale.toFixed(1)}px` : 'Unscaled';

  const liveColor = useTakeoffStore((s) => s.activeColor);
  const liveStrokeWidth = useTakeoffStore((s) => s.activeStrokeWidth);

  const color = usePortalDropdown();
  const weight = usePortalDropdown();

  return (
    <div className="shrink-0 px-3 bg-white border-b border-gray-200 flex items-center gap-2 z-10 h-14">

      {/* Calibrate */}
      <div className="flex items-stretch rounded-lg overflow-hidden border border-gray-200 shadow-sm shrink-0 h-10">
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
      <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 shadow-sm shrink-0 h-10">
        <span className="text-xs font-medium text-gray-400 mr-0.5">Tools</span>
        {MEASUREMENT_TOOLS.map((tool, index) => {
          const isActive = activeTool === tool.type || (tool.type === 'linear' && activeTool === 'polyline');
          return (
            <React.Fragment key={tool.type}>
              {index > 0 && <div className="w-px h-4 bg-gray-200" />}
              <button
                type="button"
                onClick={() => onSelectTool(tool.type)}
                title={isActive ? `${tool.label} — click again or Done to exit` : tool.label}
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
        {activeTool && (
          <button
            type="button"
            onClick={onFinishTool}
            className="ml-1 px-2 h-6 text-xs font-semibold rounded bg-gray-800 text-white hover:bg-gray-700 transition cursor-pointer"
          >
            Done
          </button>
        )}
      </div>

      {/* Color dropdown */}
      <div className="shrink-0" ref={color.triggerRef}>
        <button
          type="button"
          onClick={color.toggle}
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

      {color.open && createPortal(
        <div
          ref={color.menuRef}
          style={{ position: 'fixed', top: color.pos.top, left: color.pos.left, zIndex: 99999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl p-3"
        >
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Markup Color</p>
          <div className="grid grid-cols-4 gap-2">
            {MARKUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onColorChange(c); color.setOpen(false); }}
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

      {/* Weight dropdown */}
      <div className="shrink-0" ref={weight.triggerRef}>
        <button
          type="button"
          onClick={weight.toggle}
          title="Line weight"
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 shadow-sm hover:bg-gray-50 transition cursor-pointer h-10"
        >
          <span className="text-xs font-medium text-gray-500">Weight</span>
          <LinePreview width={liveStrokeWidth} />
          <svg className="w-3 h-3 text-gray-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4l4 4 4-4" />
          </svg>
        </button>
      </div>

      {weight.open && createPortal(
        <div
          ref={weight.menuRef}
          style={{ position: 'fixed', top: weight.pos.top, left: weight.pos.left, zIndex: 99999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[120px]"
        >
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 pt-1.5 pb-1">Line Weight</p>
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onStrokeWidthChange(w); weight.setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-1.5 hover:bg-gray-50 transition cursor-pointer ${
                liveStrokeWidth === w ? 'bg-gray-100' : ''
              }`}
            >
              <LinePreview width={w} color={liveStrokeWidth === w ? '#111827' : '#9ca3af'} />
              <span className={`text-xs tabular-nums ${liveStrokeWidth === w ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{w}px</span>
              {liveStrokeWidth === w && (
                <svg className="w-3 h-3 text-gray-800 ml-auto" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}

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

    </div>
  );
};

export default CanvasToolbar;
