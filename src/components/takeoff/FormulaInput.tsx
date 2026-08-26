import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import FormulaToolbar from "@/components/ui/FormulaToolbar";
import {
  isValidSequence,
  getSmartBracket,
  validateFormula,
  sanitizeFormulaInput,
} from "@/utils/formulaUtils";

interface FormulaInputProps {
  value: string;
  onChange: (value: string) => void;
  onCommit?: (expression: string, mode: "add" | "deduct") => void;
  onFocus?: () => void;
  /** Toggled by the Measure button in the floating toolbar. When active,
   * measurements drawn on the plan land in this card's history using
   * the current Add/Deduct mode. */
  onToggleMeasure?: () => void;
  /** Called when the user toggles Add/Deduct in the toolbar. When
   * measuring, the parent uses this to update the targeting mode so the
   * next measured value picks up the right sign. */
  onModeChange?: (mode: "add" | "deduct") => void;
  isMeasuring?: boolean;
  placeholder?: string;
  className?: string;
}

export interface FormulaInputHandle {
  focus: () => void;
}

const FormulaInput = forwardRef<FormulaInputHandle, FormulaInputProps>(({
  value,
  onChange,
  onCommit,
  onFocus: onFocusProp,
  onToggleMeasure,
  onModeChange,
  isMeasuring = false,
  placeholder = "Enter formula...",
  className = "",
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [mode, setMode] = useState<"add" | "deduct">("add");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      // Place caret at the end rather than selecting all — the user is
      // more likely to append (e.g. edit the total) than replace.
      const len = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(len, len);
    },
  }));

  const { isValid, error } = validateFormula(value);

  // When measuring, return the caret to the input whenever the measured value
  // changes. Every canvas click blurs the input (native browser behaviour), so
  // area (many clicks) would otherwise lose the caret entirely. Re-focusing on
  // any value change — not just the first — keeps the caret in the input after
  // each measurement lands, for both the linear and area tools.
  const prevValueRef = useRef("");
  useEffect(() => {
    if (isMeasuring && value && value !== prevValueRef.current) {
      inputRef.current?.focus();
    }
    prevValueRef.current = value;
  }, [value, isMeasuring]);

  // Handle clicks outside the component to close the toolbar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSymbolClick = (symbol: string) => {
    const input = inputRef.current;
    // Insert at the caret, not the end. Fall back to the end when the input
    // isn't focused / has no selection.
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);

    let nextSymbol = symbol;
    if (symbol === "()") {
      // Smart-bracket decision uses the text BEFORE the caret.
      nextSymbol = getSmartBracket(before);
    }

    // Validity is judged against the text immediately before the caret, since
    // that's where the symbol lands.
    if (isValidSequence(before, nextSymbol)) {
      const next = before + nextSymbol + after;
      onChange(next);
      // Restore the caret just after the inserted symbol.
      const caret = start + nextSymbol.length;
      requestAnimationFrame(() => {
        input?.focus();
        input?.setSelectionRange(caret, caret);
      });
      return;
    }

    input?.focus();
  };

  const commitExpression = (commitMode?: "add" | "deduct") => {
    const expr = value.trim();
    if (!expr || !onCommit) return;
    const { isValid: formulaOk } = validateFormula(expr);
    if (!formulaOk) return;
    onCommit(expr, commitMode ?? mode);
    onChange("");
    inputRef.current?.focus();
  };

  const applyInput = (raw: string) => {
    onChange(sanitizeFormulaInput(raw));
  };

  const isAllowedKey = (key: string) => {
    if (key.length !== 1) return false;
    return sanitizeFormulaInput(key).length === 1;
  };

  const handleModeChange = (nextMode: "add" | "deduct") => {
    setMode(nextMode);
    onModeChange?.(nextMode);
    if (value.trim() && validateFormula(value).isValid) {
      commitExpression(nextMode);
    }
  };

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {/* Floating Toolbar */}
      <div
        className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 transition-all duration-200 origin-bottom ${
          isFocused || isMeasuring
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 translate-y-1 pointer-events-none"
        } z-[60]`}
      >
        <FormulaToolbar
          onModeChange={handleModeChange}
          onSymbolClick={handleSymbolClick}
          onToggleMeasure={onToggleMeasure}
          isMeasuring={isMeasuring}
        />
      </div>

      {/* Input Field */}
      <div className="relative group">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => applyInput(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData("text");
            const start = e.currentTarget.selectionStart ?? value.length;
            const end = e.currentTarget.selectionEnd ?? value.length;
            applyInput(value.slice(0, start) + pasted + value.slice(end));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitExpression();
              return;
            }
            if (
              e.key === "Backspace" ||
              e.key === "Delete" ||
              e.key === "Tab" ||
              e.key === "ArrowLeft" ||
              e.key === "ArrowRight" ||
              e.key === "Home" ||
              e.key === "End" ||
              e.ctrlKey ||
              e.metaKey
            ) {
              return;
            }
            if (!isAllowedKey(e.key)) {
              e.preventDefault();
            }
          }}
          onFocus={() => {
            setIsFocused(true);
            onFocusProp?.();
          }}
          placeholder={placeholder}
          className={`w-full px-4 py-2.5 bg-surface border rounded-xl shadow-sm outline-none transition-all placeholder:text-muted/70 font-medium text-body ${
            !isValid && value.length > 0
              ? "border-red-500 focus:ring-2 focus:ring-red-100"
              : "border-[#D9D9D9] focus:ring-1 focus:ring-accent/25 focus:border-accent"
          }`}
        />

        {/* Error Tooltip */}
        {!isValid && value.length > 0 && isFocused && (
          <div className="absolute top-full left-0 mt-2 px-3 py-1 bg-danger text-white text-[10px] font-bold rounded shadow-lg z-[60]">
            {error}
            <div className="absolute -top-1 left-4 w-2 h-2 bg-danger rotate-45" />
          </div>
        )}
      </div>
    </div>
  );
});

FormulaInput.displayName = "FormulaInput";

export default FormulaInput;
