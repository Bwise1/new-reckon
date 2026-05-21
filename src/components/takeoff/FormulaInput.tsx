import React, { useState, useRef, useEffect } from "react";
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
  placeholder?: string;
  className?: string;
}

const FormulaInput: React.FC<FormulaInputProps> = ({
  value,
  onChange,
  onCommit,
  placeholder = "Enter formula...",
  className = "",
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [mode, setMode] = useState<"add" | "deduct">("add");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isValid, error } = validateFormula(value);

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
    let nextSymbol = symbol;

    if (symbol === "()") {
      nextSymbol = getSmartBracket(value);
    }

    if (isValidSequence(value, nextSymbol)) {
      onChange(value + nextSymbol);
    }

    inputRef.current?.focus();
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
    if (value.trim() && validateFormula(value).isValid) {
      commitExpression(nextMode);
    }
  };

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {/* Floating Toolbar */}
      <div
        className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 transition-all duration-200 origin-bottom ${
          isFocused
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 translate-y-1 pointer-events-none"
        } z-[60]`}
      >
        <FormulaToolbar onModeChange={handleModeChange} onSymbolClick={handleSymbolClick} />
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
          onFocus={() => setIsFocused(true)}
          placeholder={placeholder}
          className={`w-full px-4 py-2.5 bg-white border rounded-xl shadow-sm outline-none transition-all placeholder:text-gray-400 font-medium text-gray-700 ${
            !isValid && value.length > 0
              ? "border-red-500 focus:ring-2 focus:ring-red-100"
              : "border-[#D9D9D9] focus:ring-1 focus:ring-[#289693]/25 focus:border-[#289693]"
          }`}
        />

        {/* Error Tooltip */}
        {!isValid && value.length > 0 && isFocused && (
          <div className="absolute top-full left-0 mt-2 px-3 py-1 bg-red-600 text-white text-[10px] font-bold rounded shadow-lg z-[60]">
            {error}
            <div className="absolute -top-1 left-4 w-2 h-2 bg-red-600 rotate-45" />
          </div>
        )}
      </div>
    </div>
  );
};

export default FormulaInput;
