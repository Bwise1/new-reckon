import React from 'react';
import type { TakeoffMode } from '@/types/takeoff';
import { MARKUP_COLORS, MEASUREMENT_TOOLS } from '@/constants/takeoffDesign';

interface CanvasToolbarProps {
  calibrationMode: boolean;
  currentScale: number | null;
  activeTool: TakeoffMode | null;
  activeColor: string;
  onToggleCalibration: () => void;
  onSelectTool: (type: TakeoffMode) => void;
  onFinishTool: () => void;
  onColorChange: (color: string) => void;
}

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  calibrationMode,
  currentScale,
  activeTool,
  activeColor,
  onToggleCalibration,
  onSelectTool,
  onFinishTool,
  onColorChange,
}) => {
  const selectedColor = activeColor || MARKUP_COLORS[0];
  const scaleDisplay = currentScale
    ? `1m = ${currentScale.toFixed(1)}px`
    : 'Unscaled';

  return (
    <div className="shrink-0 px-4 py-2.5 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 z-10">
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
          <span className="px-4 py-2 border-l border-gray-200 text-sm font-medium bg-orange-50 text-orange-700 min-w-[220px] text-center">
            Click start point, then end point
          </span>
        ) : (
          <span
            className={`px-4 py-2 border-l border-gray-200 text-sm font-semibold tabular-nums min-w-[120px] text-center ${
              currentScale ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {scaleDisplay}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
          Tools
        </span>
        <div className="flex items-center">
          {MEASUREMENT_TOOLS.map((tool, index) => {
            const isActive =
              activeTool === tool.type ||
              (tool.type === 'linear' && activeTool === 'polyline');
            return (
              <React.Fragment key={tool.type}>
                {index > 0 && <div className="w-px h-6 bg-gray-200 mx-0.5" />}
                <button
                  type="button"
                  onClick={() => onSelectTool(tool.type)}
                  title={
                    isActive
                      ? `${tool.label} (active) — click again or Done to exit`
                      : tool.label
                  }
                  aria-pressed={isActive}
                  className={`flex items-center justify-center min-w-9 h-8 px-1 rounded text-sm font-bold transition cursor-pointer ${
                    isActive
                      ? 'bg-secondary text-white shadow-sm ring-2 ring-secondary/30'
                      : 'text-gray-600 hover:bg-gray-100'
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
        {activeTool && (
          <button
            type="button"
            onClick={onFinishTool}
            className="ml-1 px-3 py-1.5 text-xs font-semibold rounded-md bg-gray-800 text-white hover:bg-gray-700 transition cursor-pointer whitespace-nowrap"
          >
            Done
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
          Markup Color
        </span>
        <div className="flex items-center gap-1.5">
          {MARKUP_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onColorChange(color)}
              title={`Color ${color}`}
              className={`w-6 h-6 rounded-full transition cursor-pointer ${
                selectedColor === color
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
