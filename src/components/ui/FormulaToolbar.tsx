export type FormulaMode = "add" | "deduct";

interface FormulaToolbarProps {
  onModeChange?: (mode: FormulaMode) => void;
  onSymbolClick?: (symbol: string) => void;
  /** Last-used commit mode — highlighted in the segmented toggle. */
  mode?: FormulaMode;
  disabled?: boolean;
  className?: string;
}

const symbols = ["()", "+", "*", "-", "/", "√"];

/**
 * The floating takeoff toolbox (Reckon-Bill prototype): a light surface pill
 * with a monochrome Add/Deduct segmented toggle and micro arithmetic keys.
 * Strictly neutral except the active mode (primary = accent).
 */
const FormulaToolbar = ({
  onModeChange,
  onSymbolClick,
  mode = "add",
  disabled = false,
  className = "",
}: FormulaToolbarProps) => {
  return (
    <div
      className={`inline-flex flex-nowrap items-center gap-1.5 rounded-xl border border-border bg-surface p-1 shadow-xl ${className} ${
        disabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-muted p-0.5">
        {(["add", "deduct"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onModeChange?.(m)}
            className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors cursor-pointer ${
              mode === m
                ? "bg-primary text-primary-fg"
                : "text-muted hover:bg-overlay/10 hover:text-body"
            }`}
          >
            {m === "add" ? "Add" : "Deduct"}
          </button>
        ))}
      </div>

      <span className="h-5 w-px shrink-0 bg-border" />

      <div className="flex items-center gap-0.5">
        {symbols.map((symbol) => (
          <button
            key={symbol}
            type="button"
            aria-label={`Insert ${symbol}`}
            // Keep the formula input focused so the caret position is preserved
            // and the symbol inserts at the caret rather than the end.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSymbolClick?.(symbol)}
            className={`flex h-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-medium text-body transition-colors hover:bg-overlay/10 cursor-pointer ${
              symbol === "()" ? "w-7" : "w-6"
            }`}
          >
            {symbol}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FormulaToolbar;
