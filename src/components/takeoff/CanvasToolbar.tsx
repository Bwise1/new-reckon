import React, { useState, useRef, useEffect, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Hand,
  MousePointer2,
  Wand2,
  Undo2,
  Redo2,
  Trash2,
  Maximize,
  Minimize,
} from 'lucide-react';
import type { DrawTool } from '@/types/takeoff';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { useFullscreen } from '@/hooks/useFullscreen';
import RotateMenu from './RotateMenu';
import MarkupColorPicker from './MarkupColorPicker';
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
  activeTool: DrawTool | null;
  activeColor: string;
  activeRealWidth: number;
  selectedMeasurementId?: string | null;
  /** Enter calibration mode: draw a reference line, then set its scale. */
  onStartCalibration: () => void;
  onClearScale: () => void;
  onSelectTool: (type: DrawTool) => void;
  /** Reviewer/Viewer: measuring, calibration and editing tools are disabled. */
  readOnly?: boolean;
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
  activeBg = 'bg-accent text-accent-fg',
  activeLabelColor = '',
  iconScale,
  title,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  active?: boolean;
  disabled?: boolean;
  activeBg?: string;
  activeLabelColor?: string;
  /** Per-tool glyph size for optical balance; every icon still sits in the
   *  shared 24px box (prototype metric system). */
  iconScale?: string;
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
      className={`flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 transition-colors disabled:opacity-35 disabled:cursor-default cursor-pointer ${
        active ? activeBg : 'text-muted hover:bg-overlay/10 hover:text-body'
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center">
        <Icon className={iconScale ?? DEFAULT_ICON_SCALE} />
      </span>
      <span
        className={`whitespace-nowrap text-[10px] font-medium leading-none ${
          active ? activeLabelColor : ''
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

/** Prototype icon metric system: every glyph sits in a 24px box. Measure
 *  marks run larger (primary drawing tools); lucide line icons 5% smaller;
 *  Linear and Count carry per-glyph optical corrections. */
const DEFAULT_ICON_SCALE = 'h-[17.1px] w-[17.1px]';
const MEASURE_ICON_SCALE = 'h-[21.78px] w-[21.78px]';

const MEASURE_TOOLS: {
  type: DrawTool;
  label: string;
  icon: IconComponent;
  iconScale?: string;
  tooltip: string;
}[] = [
  {
    type: 'linear',
    label: 'Linear',
    icon: LinearIcon,
    iconScale: 'h-[23.96px] w-[23.96px]',
    tooltip:
      'Linear — click points; double-click, Enter, or right-click to finish. Click first point (≥4 pts) to close as area.',
  },
  {
    type: 'area',
    label: 'Area',
    icon: AreaIcon,
    tooltip: 'Area — click points; double-click or Enter to close. Right-click a finished area to deduct.',
  },
  {
    type: 'arc',
    label: 'Arc',
    icon: ArcIcon,
    tooltip: 'Arc — click start and end points, then a point on the curve.',
  },
  {
    type: 'count',
    label: 'Count',
    icon: CountIcon,
    iconScale: 'h-[23.43px] w-[23.43px]',
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
  onClearScale,
  onSelectTool,
  readOnly = false,
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

  // Local input state so the field stays editable mid-type.
  // Width is OPT-IN: empty (or 0) means hairline. Real-world width is for
  // walls and the like; measurements shouldn't start life as thick bands.
  // A selected hairline measurement round-trips to ~2px/scale, so anything
  // below 5mm displays as empty too.
  const widthDisplay = (w: number) => (w >= 0.005 ? Number(w).toFixed(3) : '');
  const [widthInput, setWidthInput] = useState(widthDisplay(activeRealWidth));
  const widthSeed = `${selectedMeasurementId ?? ''}:${activeRealWidth}`;
  const [seededWidth, setSeededWidth] = useState(widthSeed);
  if (widthSeed !== seededWidth) {
    setSeededWidth(widthSeed);
    setWidthInput(widthDisplay(activeRealWidth));
  }
  const commitWidth = (raw: string) => {
    if (raw.trim() === '') {
      onRealWidthChange(0);
      return;
    }
    const parsed = parseFloat(raw);
    if (isFinite(parsed) && parsed >= 0) {
      // Construction speaks millimetres: a block wall is "225", not 225m.
      // Anything over 2 is read as mm; the result clamps to a 2m ceiling so
      // a typo can never paint the whole sheet as one giant band again.
      let w = parsed > 2 ? parsed / 1000 : parsed;
      w = Math.min(w, 2);
      onRealWidthChange(w);
    } else {
      setWidthInput(widthDisplay(activeRealWidth));
    }
  };

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
          <IconButton
            icon={MousePointer2}
            label="Select"
            active={isSelectMode}
            onClick={onToggleSelect}
          />
          <IconButton icon={Hand} label="Pan" active={isPanningMode} onClick={onTogglePan} />
        </ToolGroup>

        <Divider />

        <ToolGroup title="Measure" tour="tools">
          <div ref={calTriggerRef} data-tour="calibrate">
            <IconButton
              icon={CalibrateIcon}
              label={calibrationMode ? 'Calibrating…' : 'Scale'}
              iconScale={MEASURE_ICON_SCALE}
              active
              activeBg={
                calibrationMode
                  ? 'bg-accent text-accent-fg animate-pulse'
                  : 'bg-overlay/10 text-body'
              }
              activeLabelColor={calibrationMode ? 'text-accent-strong' : 'text-body'}
              title={readOnly ? 'Read-only role' : 'Scale / calibration options'}
              disabled={readOnly}
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
                iconScale={tool.iconScale ?? MEASURE_ICON_SCALE}
                active={isActive}
                title={readOnly ? 'Read-only role' : isActive ? `${tool.label} — click again or Done to exit` : tool.tooltip}
                disabled={readOnly}
                onClick={() => (isActive ? onFinishTool() : onSelectTool(tool.type))}
              />
            );
          })}
          <IconButton
            icon={Wand2}
            label="Auto Area"
            disabled={readOnly}
            active={autoAreaMode}
            title="Auto area — click once inside a room and its boundary is detected automatically"
            onClick={onToggleAutoArea}
          />
        </ToolGroup>

        <Divider />

        <ToolGroup title="Style">
          <MarkupColorPicker
            value={liveColor}
            onChange={onColorChange}
            portalTheme={portalTheme}
          />

          {/* Width */}
          <div
            className="flex flex-col items-center gap-[2px] px-1 py-0.5"
            title={
              selectedMeasurementId && currentScale
                ? 'Edit selected measurement line width'
                : currentScale
                  ? 'Wall width — metres, or plain mm (225 = 0.225m). Empty draws a thin line'
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
                min="0"
                step="0.01"
                placeholder="—"
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
          <IconButton icon={Undo2} label="Undo" disabled={!canUndo || readOnly} onClick={onUndo} />
          <IconButton icon={Redo2} label="Redo" disabled={!canRedo || readOnly} onClick={onRedo} />
          <IconButton
            icon={Trash2}
            label="Clear"
            title="Clear all measurements on this page"
            onClick={onClearAll}
          />
        </ToolGroup>

        <Divider />

        <ToolGroup title="Page">
          <RotateMenu
            portalTheme={portalTheme}
            onRotate={(direction, scope) => {
              if (scope === 'all') {
                if (direction === 'left') onRotateAllCCW();
                else onRotateAllCW();
              } else if (direction === 'left') {
                onRotateCCW();
              } else {
                onRotateCW();
              }
            }}
          />
          {fullscreen.supported && (
            <IconButton
              icon={fullscreen.isFullscreen ? Minimize : Maximize}
              label="Full Screen"
              active={fullscreen.isFullscreen}
              activeBg="bg-overlay/10 text-body"
              onClick={fullscreen.toggle}
            />
          )}
        </ToolGroup>
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
                onStartCalibration();
              }}
              className="block w-full px-3 py-2 text-left hover:bg-overlay/5 cursor-pointer"
            >
              <span className="font-medium text-body">Set scale</span>
              <span className="block text-[11px] text-muted">
                Draw a line of known length, then enter its real distance
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

    </div>
  );
};

export default CanvasToolbar;
