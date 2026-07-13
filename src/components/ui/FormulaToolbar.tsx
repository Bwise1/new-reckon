import { Ruler } from "lucide-react";

export type FormulaMode = "add" | "deduct";

interface FormulaToolbarProps {
  onModeChange?: (mode: FormulaMode) => void;
  onSymbolClick?: (symbol: string) => void;
  /** Fired when the user clicks the Measure button. Parent enters
   * boqTargeting mode; measurements drawn on the plan while active
   * land in this card's history using the current mode (add|deduct). */
  onToggleMeasure?: () => void;
  /** True when this card is currently the boqTargeting target. Renders
   * the Measure button in an active state. */
  isMeasuring?: boolean;
  disabled?: boolean;
  className?: string;
}

const symbols = ["()", "+", "*", "-", "/", "√"];

const FormulaToolbar = ({
  onModeChange,
  onSymbolClick,
  onToggleMeasure,
  isMeasuring = false,
  disabled = false,
  className = "",
}: FormulaToolbarProps) => {
  return (
    <div
      className={`inline-flex flex-nowrap items-center gap-0.5 px-1 py-1 bg-[#1a1a1a] rounded-xl shadow-[0_6px_18px_rgba(0,0,0,0.3)] border border-white/10 ${className} ${
        disabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onModeChange?.("add")}
        className="px-2 py-1 rounded-md font-bold text-[10px] text-black bg-[#eeb952] hover:bg-[#e5ad42] active:scale-95 transition-transform shrink-0 cursor-pointer"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => onModeChange?.("deduct")}
        className="px-2 py-1 rounded-md font-bold text-[10px] text-white bg-[#f8714b] hover:bg-[#ef6340] active:scale-95 transition-transform shrink-0 cursor-pointer"
      >
        Deduct
      </button>
      <button
        type="button"
        onClick={() => onToggleMeasure?.()}
        title={isMeasuring ? 'Stop measuring (Esc)' : 'Measure on the plan'}
        aria-label={isMeasuring ? 'Stop measuring' : 'Measure on the plan'}
        className={`w-6 h-6 rounded-md shrink-0 cursor-pointer active:scale-95 transition-transform flex items-center justify-center ${
          isMeasuring
            ? 'bg-white text-[#1a1a1a]'
            : 'bg-[#289693] hover:bg-[#237e7b] text-white'
        }`}
      >
        <Ruler className="w-3 h-3" />
      </button>

      <div className="w-px h-4 bg-white/15 shrink-0 mx-0.5" />

      {symbols.map((symbol) => (
        <button
          key={symbol}
          type="button"
          onClick={() => onSymbolClick?.(symbol)}
            className="flex items-center justify-center w-6 h-6 shrink-0 bg-white text-[#3d3d3d] font-bold text-[11px] rounded-md hover:bg-gray-100 active:scale-90 transition-transform shadow-sm cursor-pointer"
        >
          {symbol}
        </button>
      ))}
    </div>
  );
};

export default FormulaToolbar;
