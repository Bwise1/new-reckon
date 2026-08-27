import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSuggestions } from '@/hooks/useSuggestions';

interface DescriptionFieldProps {
  value: string;
  itemLabel: string;
  onChange: (value: string) => void;
}

const DescriptionField: React.FC<DescriptionFieldProps> = ({
  value,
  itemLabel,
  onChange,
}) => {
  const suggestions = useSuggestions('description');
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
      <div className="flex items-stretch rounded-md border border-border bg-surface outline-none transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <span className="flex w-9 shrink-0 items-start justify-center pt-1.5 text-sm font-semibold text-body">
          {itemLabel}
        </span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Item description"
          rows={3}
          className="flex-1 min-w-0 resize-none rounded-r-md bg-transparent px-2.5 py-1.5 text-sm text-body outline-none placeholder:text-muted/70"
        />
      </div>

      {showDropdown && (
        <ul className="absolute z-40 left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {filtered.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-body hover:bg-overlay/5 cursor-pointer"
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

export default DescriptionField;
