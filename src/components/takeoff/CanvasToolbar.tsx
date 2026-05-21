import React from 'react';
import type { TakeoffItem, TakeoffMode } from '@/types/takeoff';
import { MARKUP_COLORS, MEASUREMENT_TOOLS } from '@/constants/takeoffDesign';

interface CanvasToolbarProps {
  calibrationMode: boolean;
  currentScale: number | null;
  calibrationDistance: string;
  takeoffItems: TakeoffItem[];
  activeItemId: string | null;
  onToggleCalibration: () => void;
  onCalibrationDistanceChange: (value: string) => void;
  onSelectTool: (type: TakeoffMode) => void;
  onColorChange: (color: string) => void;
}

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  calibrationMode,
  currentScale,
  calibrationDistance,
  takeoffItems,
  activeItemId,
  onToggleCalibration,
  onCalibrationDistanceChange,
  onSelectTool,
  onColorChange,
}) => {
  const activeItem = takeoffItems.find((i) => i.id === activeItemId);
  const activeColor = activeItem?.color ?? MARKUP_COLORS[0];
  const scaleDisplay =
    calibrationDistance && currentScale
      ? `${calibrationDistance}m`
      : currentScale
        ? '—'
        : '—';

  return (
    <div className="shrink-0 px-4 py-2.5 bg-white border-b border-gray-200 flex items-center gap-3 z-10">
      <div className="flex items-stretch rounded-lg overflow-hidden border border-gray-200 shadow-sm">
        <button
          type="button"
          onClick={onToggleCalibration}
          className={`px-4 py-2 text-sm font-bold transition cursor-pointer ${
            calibrationMode
              ? 'bg-[#f97316] text-white animate-pulse'
              : 'bg-[#f97316] text-white hover:bg-[#ea580c]'
          }`}
        >
          {calibrationMode ? 'Calibrating…' : 'Calibrate'}
        </button>
        {calibrationMode ? (
          <input
            type="text"
            placeholder="m"
            value={calibrationDistance}
            onChange={(e) => onCalibrationDistanceChange(e.target.value)}
            className="w-20 px-3 py-2 border-l border-gray-200 bg-gray-50 text-sm outline-none focus:ring-2 focus:ring-orange-200 focus:ring-inset"
          />
        ) : (
          <span className="px-4 py-2 border-l border-gray-200 bg-gray-100 text-sm font-semibold text-gray-700 tabular-nums min-w-[72px] text-center">
            {scaleDisplay}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
          Measurement Tool
        </span>
        <div className="flex items-center">
          {MEASUREMENT_TOOLS.map((tool, index) => {
            const isActive =
              activeItem?.type === tool.type ||
              (tool.type === 'linear' && activeItem?.type === 'polyline');
            return (
              <React.Fragment key={tool.type}>
                {index > 0 && <div className="w-px h-6 bg-gray-200 mx-0.5" />}
                <button
                  type="button"
                  onClick={() => onSelectTool(tool.type)}
                  title={tool.label}
                  className={`flex items-center justify-center w-9 h-8 rounded text-sm font-bold transition cursor-pointer ${
                    isActive ? 'text-secondary' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>
                    +<sub className="text-[10px]">{tool.short}</sub>
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
          Change Markup Color
        </span>
        <div className="flex items-center gap-1.5">
          {MARKUP_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onColorChange(color)}
              title={`Color ${color}`}
              className={`w-6 h-6 rounded-full transition cursor-pointer ${
                activeColor === color
                  ? 'ring-2 ring-offset-1 ring-gray-800'
                  : 'hover:scale-110'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CanvasToolbar;
