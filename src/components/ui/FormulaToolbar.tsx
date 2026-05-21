
interface FormulaToolbarProps {
  onModeChange?: (mode: "add" | "deduct") => void;
  onSymbolClick?: (symbol: string) => void;
  disabled?: boolean;
  className?: string;
}

const symbols = ["()", "+", "*", "-", "/", "√"];

const FormulaToolbar = ({
  onModeChange,
  onSymbolClick,
  disabled = false,
  className = "",
}: FormulaToolbarProps) => {
  return (
    <div
      className={`inline-flex flex-nowrap items-center gap-1 px-1.5 py-1.5 bg-[#1a1a1a] rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.35)] border border-white/10 ${className} ${
        disabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onModeChange?.("add")}
        className="px-3 py-1.5 rounded-lg font-bold text-xs text-black bg-[#eeb952] hover:bg-[#e5ad42] active:scale-95 transition-transform shrink-0 cursor-pointer"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => onModeChange?.("deduct")}
        className="px-3 py-1.5 rounded-lg font-bold text-xs text-white bg-[#f8714b] hover:bg-[#ef6340] active:scale-95 transition-transform shrink-0 cursor-pointer"
      >
        Deduct
      </button>

      <div className="w-px h-6 bg-white/15 shrink-0 mx-0.5" />

      {symbols.map((symbol) => (
        <button
          key={symbol}
          type="button"
          onClick={() => onSymbolClick?.(symbol)}
            className="flex items-center justify-center w-8 h-8 shrink-0 bg-white text-[#3d3d3d] font-bold text-sm rounded-lg hover:bg-gray-100 active:scale-90 transition-transform shadow-sm cursor-pointer"
        >
          {symbol}
        </button>
      ))}
    </div>
  );
};

export default FormulaToolbar;
