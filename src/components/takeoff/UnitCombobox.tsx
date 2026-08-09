import React, { useEffect, useMemo, useRef, useState } from "react";
import { UNIT_PRESETS } from "@/types/takeoff";

interface UnitComboboxProps {
  /** Current unit (canonical value, e.g. "m2"). */
  value: string;
  onChange: (unit: string) => void;
  className?: string;
}

/** Display label for a value ("m2" → "m²"), falling back to the raw value. */
const displayFor = (value: string) =>
  UNIT_PRESETS.find((u) => u.value === value)?.label ?? value;

/**
 * Editable unit selector: shows the current unit, opens a dropdown of presets
 * (m, m², m³, nrs, item, kg, tonns) filtered as the user types, and accepts any
 * custom unit the user types (the backend stores free-text units). Replaces the
 * old 5-button UnitSelector row.
 */
const UnitCombobox: React.FC<UnitComboboxProps> = ({ value, onChange, className = "" }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return UNIT_PRESETS;
    return UNIT_PRESETS.filter(
      (u) => u.value.toLowerCase().includes(q) || u.label.toLowerCase().includes(q),
    );
  }, [query]);

  const commit = (unit: string) => {
    const next = unit.trim();
    if (next) onChange(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {!open ? (
        // Collapsed: shows the current unit; click to edit/pick.
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Change unit"
          className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800 cursor-pointer"
        >
          <span>{displayFor(value)}</span>
          <svg className="w-3 h-3 text-gray-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4l4 4 4-4" />
          </svg>
        </button>
      ) : (
        <input
          autoFocus
          type="text"
          value={query}
          placeholder={displayFor(value)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Enter commits the typed value (custom unit) or the top match.
              commit(query.trim() || filtered[0]?.value || value);
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          className="w-16 text-[13px] text-gray-800 text-right bg-transparent border-b border-gray-300 outline-none"
        />
      )}

      {open && (
        <ul className="absolute z-40 right-0 mt-1 w-28 max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.map((u) => (
            <li key={u.value}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(u.value);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer hover:bg-[#289693]/10 ${
                  u.value === value ? "text-[#289693] font-semibold" : "text-gray-700"
                }`}
              >
                {u.label}
              </button>
            </li>
          ))}
          {query.trim() && !filtered.some((u) => u.value === query.trim()) && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(query.trim());
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-[#289693]/10 cursor-pointer"
              >
                Use “{query.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default UnitCombobox;
