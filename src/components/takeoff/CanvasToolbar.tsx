import React, { useState, useRef, useEffect, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Hand,
  MousePointer2,
  Magnet,
  Wand2,
  Undo2,
  Redo2,
  RotateCcw,
  RotateCw,
  CopyCheck,
  Trash2,
  Maximize,
  Minimize,
} from 'lucide-react';
import type { TakeoffMode } from '@/types/takeoff';
import { MARKUP_COLORS } from '@/constants/takeoffDesign';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useProjectTheme } from '@/hooks/useProjectTheme';
import {
  CalibrateIcon,
  AreaIcon,
  ArcIcon,
  LinearIcon,
  CountIcon,
} from './icons/ToolIcons';

type IconComponent = ComponentType<{ className?: string; strokeWidth?: number }>;

interface CanvasToolbarProps {
  calibrationMode: boolean;
  currentScale: number | null;
  activeTool: TakeoffMode | null;
  activeColor: string;
  activeRealWidth: number;
  selectedMeasurementId?: string | null;
  /** Calibration: draw the line first, then type its distance (legacy flow). */
  onStartCalibration: () => void;
  /** Calibration: type the known dimension first, then draw the line. */
  onStartKnownCalibration: () => void;
  onClearScale: () => void;
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
  isPanningMode: boolean;
  onTogglePan: () => void;
  isSelectMode: boolean;
  onToggleSelect: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClearAll: () => void;
}

/** Grouped toolbar section with a tiny uppercase title (Reckon-Bill layout). */
function ToolGroup({
  title,
  children,
  tour,
}: {
  title: string;
  children: ReactNode;
  tour?: string;
}) {
  return (
    <div data-tour={tour} className="flex shrink-0 flex-col items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted/70 whitespace-nowrap">
        {title}
      </span>
      <div className="flex items-end gap-0.5">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="mb-0.5 self-stretch w-px shrink-0 bg-border" />;
}

function IconButton({
  icon: Icon,
  label,
  active,
  disabled,
  activeBg = 'bg-overlay/10',
  activeLabelColor = 'text-body',
  title,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  active?: boolean;
  disabled?: boolean;
  activeBg?: string;
  activeLabelColor?: string;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={title ?? label}
      onClick={onClick}
      className="flex flex-col items-center gap-[2px] rounded-lg px-1 py-0.5 disabled:opacity-35 disabled:cursor-default cursor-pointer"
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          active ? activeBg : 'text-muted hover:bg-overlay/10'
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={1.5} />
      </span>
      <span
        className={`whitespace-nowrap text-[9.5px] font-medium leading-none ${
          active ? activeLabelColor : 'text-muted'
        }`}
      >
        {label}
      </span>
    </button>
  );
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

const MEASURE_TOOLS: {
  type: TakeoffMode;
  label: string;
  icon: IconComponent;
  activeBg: string;
  activeLabelColor: string;
  tooltip: string;
}[] = [
  {
    type: 'linear',
    label: 'Linear',
    icon: LinearIcon,
    activeBg: 'bg-navy-soft/10',
    activeLabelColor: 'text-navy-soft',
    tooltip:
      'Linear — click points; double-click, Enter, or right-click to finish. Click first point (≥4 pts) to close as area.',
  },
  {
    type: 'area',
    label: 'Area',
    icon: AreaIcon,
    activeBg: 'bg-accent/10',
    activeLabelColor: 'text-accent-strong',
    tooltip: 'Area — click points; double-click or Enter to close. Right-click a finished area to deduct.',
  },
  {
    type: 'count',
    label: 'Count',
    icon: CountIcon,
    activeBg: 'bg-danger/10',
    activeLabelColor: 'text-danger',
    tooltip: 'Count — click to place count markers.',
  },
];

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  calibrationMode,
  currentScale,
  activeTool,
  activeRealWidth,
  selectedMeasurementId,
  onStartCalibration,
  onStartKnownCalibration,
  onClearScale,
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
  isPanningMode,
  onTogglePan,
  isSelectMode,
  onToggleSelect,
  snapEnabled,
  onToggleSnap,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClearAll,
}) => {
  const liveColor = useTakeoffStore((s) => s.activeColor);
  const fullscreen = useFullscreen();
  const { theme: portalTheme } = useProjectTheme();

  // Rotate applies to the current page, or to every page while the
  // Apply-to-All toggle is on (Reckon-Bill behaviour).
  const [applyToAll, setApplyToAll] = useState(false);

  // Local input state so the field stays editable mid-type.
  const [widthInput, setWidthInput] = useState(Number(activeRealWidth).toFixed(3));
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

  const {
    open: colorOpen,
    setOpen: setColorOpen,
    toggle: toggleColor,
    triggerRef: colorTriggerRef,
    menuRef: colorMenuRef,
    pos: colorPos,
  } = usePortalDropdown();

  const {
    open: calOpen,
    setOpen: setCalOpen,
    toggle: toggleCal,
    triggerRef: calTriggerRef,
    menuRef: calMenuRef,
    pos: calPos,
  } = usePortalDropdown();

  return (
    <div className="shrink-0 flex w-full overflow-x-auto bg-surface border-b border-border z-10 h-[92px]">
      <div className="flex items-center gap-1.5 mx-auto px-3">
        <ToolGroup title="Pointer">
          <IconButton icon={Hand} label="Pan" active={isPanningMode} onClick={onTogglePan} />
          <IconButton
            icon={MousePointer2}
            label="Select"
            active={isSelectMode}
            onClick={onToggleSelect}
          />
          <IconButton
            icon={Magnet}
            label="Snap"
            active={snapEnabled}
            onClick={onToggleSnap}
            title={snapEnabled ? 'Snap: on' : 'Snap: off'}
          />
        </ToolGroup>

        <Divider />

        <ToolGroup title="Measure" tour="tools">
          <div ref={calTriggerRef} data-tour="calibrate">
            <IconButton
              icon={CalibrateIcon}
              label={calibrationMode ? 'Calibrating…' : 'Scale'}
              active
              activeBg={
                calibrationMode
                  ? 'bg-warn/20 animate-pulse'
                  : currentScale
                    ? 'bg-accent/10'
                    : 'bg-warn/15'
              }
              activeLabelColor={
                calibrationMode
                  ? 'text-warn-strong'
                  : currentScale
                    ? 'text-accent-strong'
                    : 'text-warn-strong'
              }
              title="Scale / calibration options"
              onClick={toggleCal}
            />
          </div>
          {MEASURE_TOOLS.map((tool) => {
            const isActive =
              activeTool === tool.type || (tool.type === 'linear' && activeTool === 'polyline');
            return (
              <IconButton
                key={tool.type}
                icon={tool.icon}
                label={tool.label}
                active={isActive}
                activeBg={tool.activeBg}
                activeLabelColor={tool.activeLabelColor}
                title={isActive ? `${tool.label} — click again or Done to exit` : tool.tooltip}
                onClick={() => (isActive ? onFinishTool() : onSelectTool(tool.type))}
              />
            );
          })}
          <IconButton
            icon={ArcIcon}
            label="Arc"
            disabled
            title="Arc — coming soon"
          />
          <IconButton
            icon={Wand2}
            label="Auto Area"
            active={autoAreaMode}
            activeBg="bg-accent/10"
            activeLabelColor="text-accent-strong"
            title="Auto area — click once inside a room and its boundary is detected automatically"
            onClick={onToggleAutoArea}
          />
        </ToolGroup>

        <Divider />

        <ToolGroup title="Style">
          {/* Color */}
          <div ref={colorTriggerRef}>
            <button
              type="button"
              aria-label="Markup color"
              title="Markup color"
              onClick={toggleColor}
              className="flex flex-col items-center gap-[2px] rounded-lg px-1 py-0.5 cursor-pointer"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-overlay/10 transition-colors">
                <span
                  className="h-4 w-4 rounded-full border border-black/10"
                  style={{ backgroundColor: liveColor }}
                />
              </span>
              <span className="whitespace-nowrap text-[9.5px] font-medium leading-none text-muted">
                Color
              </span>
            </button>
          </div>

          {/* Width */}
          <div
            className="flex flex-col items-center gap-[2px] px-1 py-0.5"
            title={
              selectedMeasurementId && currentScale
                ? 'Edit selected measurement line width'
                : currentScale
                  ? 'Line width in metres — scaled to plan calibration'
                  : 'Calibrate first to use real-world width'
            }
          >
            <div
              className={`flex h-8 items-center gap-1 rounded-lg px-2 transition-colors ${
                selectedMeasurementId && currentScale
                  ? 'bg-secondary/10 ring-1 ring-secondary/30'
                  : 'bg-surface-muted hover:bg-overlay/15'
              }`}
            >
              <input
                type="number"
                min="0.001"
                step="0.01"
                value={widthInput}
                disabled={!currentScale}
                onChange={(e) => setWidthInput(e.target.value)}
                onBlur={(e) => commitWidth(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="w-9 bg-transparent text-right text-[10px] font-semibold text-body outline-none disabled:text-muted/70 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-[9.5px] font-medium text-muted">m</span>
            </div>
            <span className="whitespace-nowrap text-[9.5px] font-medium leading-none text-muted">
              {selectedMeasurementId && currentScale ? 'Edit Width' : 'Width'}
            </span>
          </div>
        </ToolGroup>

        <Divider />

        <ToolGroup title="Edit">
          <IconButton icon={Undo2} label="Undo" disabled={!canUndo} onClick={onUndo} />
          <IconButton icon={Redo2} label="Redo" disabled={!canRedo} onClick={onRedo} />
          <IconButton
            icon={Trash2}
            label="Clear"
            title="Clear all measurements on this page"
            onClick={onClearAll}
          />
        </ToolGroup>

        <Divider />

        <ToolGroup title="Page">
          <IconButton
            icon={RotateCcw}
            label="Rotate Left"
            title={applyToAll ? 'Rotate every page left' : 'Rotate this page left'}
            onClick={() => (applyToAll ? onRotateAllCCW() : onRotateCCW())}
          />
          <IconButton
            icon={RotateCw}
            label="Rotate Right"
            title={applyToAll ? 'Rotate every page right' : 'Rotate this page right'}
            onClick={() => (applyToAll ? onRotateAllCW() : onRotateCW())}
          />
          <IconButton
            icon={CopyCheck}
            label="Apply to All"
            active={applyToAll}
            activeBg="bg-accent text-white"
            activeLabelColor="text-accent-strong"
            title="When on, rotations apply to every page of the plan"
            onClick={() => setApplyToAll((prev) => !prev)}
          />
        </ToolGroup>

        {fullscreen.supported && (
          <>
            <Divider />
            <ToolGroup title="View">
              <IconButton
                icon={fullscreen.isFullscreen ? Minimize : Maximize}
                label={fullscreen.isFullscreen ? 'Exit' : 'Full screen'}
                onClick={fullscreen.toggle}
              />
            </ToolGroup>
          </>
        )}
      </div>

      {/* Scale / calibration menu */}
      {calOpen &&
        createPortal(
          <div
            ref={calMenuRef}
            style={{ position: 'fixed', top: calPos.top, left: calPos.left, zIndex: 99999 }}
            data-theme={portalTheme}
            className="w-56 bg-surface border border-border rounded-xl shadow-xl py-1.5 text-sm"
          >
            <p className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold text-muted/70 uppercase tracking-wide border-b border-border">
              {currentScale ? `Scale set — 1m = ${currentScale.toFixed(1)}px` : 'Not scaled'}
            </p>
            <button
              type="button"
              onClick={() => {
                setCalOpen(false);
                onStartKnownCalibration();
              }}
              className="block w-full px-3 py-2 text-left hover:bg-overlay/5 cursor-pointer"
            >
              <span className="font-medium text-body">Use known dimension</span>
              <span className="block text-[11px] text-muted">
                Type a measurement, then draw it on the plan
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCalOpen(false);
                onStartCalibration();
              }}
              className="block w-full px-3 py-2 text-left hover:bg-overlay/5 cursor-pointer"
            >
              <span className="font-medium text-body">Draw, then enter distance</span>
              <span className="block text-[11px] text-muted">
                Trace a line first, type its real length after
              </span>
            </button>
            <button
              type="button"
              disabled={!currentScale}
              onClick={() => {
                setCalOpen(false);
                onClearScale();
              }}
              className="block w-full px-3 py-2 text-left text-danger hover:bg-danger/10 disabled:opacity-40 disabled:cursor-default cursor-pointer border-t border-border"
            >
              Clear scale
            </button>
          </div>,
          document.body
        )}

      {colorOpen &&
        createPortal(
          <div
            ref={colorMenuRef}
            style={{ position: 'fixed', top: colorPos.top, left: colorPos.left, zIndex: 99999 }}
            data-theme={portalTheme}
            className="bg-surface border border-border rounded-xl shadow-xl p-3"
          >
            <p className="text-[10px] font-semibold text-muted/70 uppercase tracking-wide mb-2">
              Markup Color
            </p>
            <div className="grid grid-cols-4 gap-2">
              {MARKUP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onColorChange(c);
                    setColorOpen(false);
                  }}
                  className="relative w-8 h-10 rounded-full transition hover:scale-110 cursor-pointer"
                  style={{ backgroundColor: c }}
                  title={c}
                >
                  {liveColor === c && (
                    <svg
                      className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default CanvasToolbar;
