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
      <div className="flex gap-2 rounded-lg border border-[#D9D9D9] bg-surface px-3 py-3">
        <span className="font-bold text-accent shrink-0 text-sm mt-0.5">{itemLabel}</span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Description"
          rows={3}
          className="w-full text-sm font-semibold text-black leading-relaxed bg-transparent border-none outline-none resize-none placeholder:text-muted/70 placeholder:font-normal"
        />
      </div>

      {showDropdown && (
        <ul className="absolute z-40 left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
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

export default DescriptionField;
