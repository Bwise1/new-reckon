import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 * custom unit the user types. The dropdown is rendered in a portal so it
 * escapes the Qty box's `overflow-hidden` clipping.
 */
const UnitCombobox: React.FC<UnitComboboxProps> = ({ value, onChange, className = "" }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 120,
  });

  // Position the portal dropdown under the trigger.
  const openMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      setPos({ top: r.bottom + 4, left: r.right - 120, width: 120 });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        !triggerRef.current?.contains(t) &&
        !menuRef.current?.contains(t)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

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
    <div ref={triggerRef} className={`relative ${className}`}>
      {!open ? (
        <button
          type="button"
          onClick={openMenu}
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
              commit(query.trim() || filtered[0]?.value || value);
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          className="w-16 text-[13px] text-gray-800 text-right bg-transparent border-b border-gray-300 outline-none"
        />
      )}

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
          >
            <ul className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
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
          </div>,
          document.body,
        )}
    </div>
  );
};

export default UnitCombobox;
