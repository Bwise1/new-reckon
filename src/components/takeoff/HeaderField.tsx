import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSuggestions } from '@/hooks/useSuggestions';

interface HeaderFieldProps {
  value: string;
  onChange: (value: string) => void;
}

const HeaderField: React.FC<HeaderFieldProps> = ({ value, onChange }) => {
  const suggestions = useSuggestions('header');
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    if (!value.trim()) return suggestions.slice(0, 6);
    const q = value.toLowerCase();
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
  }, [suggestions, value]);

  const showDropdown = isFocused && filtered.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        placeholder="Header"
        className="w-full px-3 py-2.5 rounded-lg border border-[#D9D9D9] bg-surface text-sm font-bold text-body placeholder:text-muted/70 outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
      />
      {showDropdown && (
        <ul className="absolute z-40 left-0 right-0 mt-1 max-h-32 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {filtered.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-body hover:bg-accent/10 cursor-pointer"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(suggestion);
                  setIsFocused(false);
                }}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default HeaderField;
