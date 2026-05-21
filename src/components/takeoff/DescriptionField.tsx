import React, { useEffect, useMemo, useRef, useState } from 'react';
import { boqService } from '@/services/boq.service';

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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setIsLoading(true);
        const response = await boqService.getSuggestions('description');
        if (!mounted) return;
        setSuggestions(
          (response.data?.suggestions || []).map((s) => s.value).filter(Boolean)
        );
      } catch {
        if (mounted) setSuggestions([]);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

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

  const showDropdown = isFocused && (isLoading || filtered.length > 0);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2 rounded-lg border border-[#D9D9D9] bg-white px-3 py-3">
        <span className="font-bold text-[#289693] shrink-0 text-sm mt-0.5">{itemLabel}</span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Description"
          rows={3}
          className="w-full text-sm font-semibold text-[#003566] leading-relaxed bg-transparent border-none outline-none resize-none placeholder:text-gray-400 placeholder:font-normal"
        />
      </div>

      {showDropdown && (
        <ul className="absolute z-40 left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {isLoading ? (
            <li className="px-3 py-2 text-xs text-gray-400">Loading suggestions...</li>
          ) : (
            filtered.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-[#289693]/10 cursor-pointer"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(suggestion);
                    setIsFocused(false);
                  }}
                >
                  {suggestion}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

export default DescriptionField;
