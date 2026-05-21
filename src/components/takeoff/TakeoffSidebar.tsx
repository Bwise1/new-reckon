import React from "react";
import type { TakeoffItem, TakeoffMode } from "@/types/takeoff";
import { Ruler, Square, Hash, Trash2, Plus, Copy, ArrowUp, ArrowDown } from "lucide-react";

interface TakeoffSidebarProps {
  items: TakeoffItem[];
  scales?: Record<number, number>;
  activeItemId: string | null;
  onSelectItem: (id: string) => void;
  onCreateItem: (type: TakeoffMode) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (id: string) => void;
  onMoveItemUp: (id: string) => void;
  onMoveItemDown: (id: string) => void;
  onUpdateItem: (id: string, updates: Partial<TakeoffItem>) => void;
}

const TakeoffSidebar: React.FC<TakeoffSidebarProps> = ({
  items,
  scales = {},
  activeItemId,
  onSelectItem,
  onCreateItem,
  onDeleteItem,
  onDuplicateItem,
  onMoveItemUp,
  onMoveItemDown,
  onUpdateItem,
}) => {
  const getIcon = (type: TakeoffMode) => {
    switch (type) {
      case "linear":
      case "polyline":
        return <Ruler className="w-4 h-4" />;
      case "area":
        return <Square className="w-4 h-4" />;
      case "count":
        return <Hash className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-[#1a1a1a] border-r border-gray-800 h-full flex flex-col shadow-xl" style={{ width: '195px' }}>
      <div className="p-4 border-b border-gray-800 bg-black/30">
        <h2 className="text-xl font-bold text-white">Takeoffs</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {items.map((item) => {
          const pages = Array.from(new Set(item.measurements.map(m => m.page))).sort((a, b) => a - b);
          return (
            <div
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              className={`group p-3 rounded-lg border transition-all cursor-pointer ${
                activeItemId === item.id
                  ? "bg-gray-800 border-blue-500/50 shadow-lg shadow-blue-500/20"
                  : "bg-gray-900/50 border-gray-700 hover:border-gray-600 hover:bg-gray-800/50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full mr-1"
                    style={{ backgroundColor: item.color }}
                  />
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => onUpdateItem(item.id, { name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-transparent font-semibold text-gray-200 text-sm border-none focus:ring-0 w-full p-0"
                  />
                </div>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveItemUp(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-gray-200 transition-opacity"
                    title="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveItemDown(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-gray-200 transition-opacity"
                    title="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateItem(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-blue-300 transition-opacity"
                    title="Duplicate"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteItem(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-opacity"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {pages.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {pages.map(p => (
                    <div key={p} className="flex items-center space-x-1 px-1.5 py-0.5 bg-gray-800 rounded text-[10px] text-gray-400 border border-gray-700">
                      <span>Pg {p}</span>
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${scales[p] ? 'bg-green-500' : 'bg-red-400 animate-pulse'}`}
                        title={scales[p] ? 'Calibrated' : 'Uncalibrated'}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-gray-400">
                <div className="flex items-center space-x-1">
                  {getIcon(item.type)}
                  <span>{item.type}</span>
                </div>
                <span className="font-mono bg-gray-800 px-2 py-0.5 rounded border border-gray-700 text-gray-300">
                  {item.totalQuantity.toFixed(2)} {item.unit}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-gray-800 bg-black/30 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onCreateItem("linear")}
          className="flex items-center justify-center space-x-1 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition shadow-sm text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Linear</span>
        </button>
        <button
          type="button"
          onClick={() => onCreateItem("area")}
          className="flex items-center justify-center space-x-1 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition shadow-sm text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Area</span>
        </button>
        <button
          type="button"
          onClick={() => onCreateItem("count")}
          className="flex items-center justify-center space-x-1 p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition shadow-sm text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Count</span>
        </button>
      </div>
    </div>
  );
};

export default TakeoffSidebar;
