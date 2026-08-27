import React from "react";
import type { UnitType } from "@/types/takeoff";

interface UnitSelectorProps {
  selectedUnit: UnitType;
  onChange: (unit: UnitType) => void;
  className?: string;
}

const units: { label: React.ReactNode; value: UnitType }[] = [
  { label: "m", value: "m" },
  { label: <span>m<sup>2</sup></span>, value: "m2" },
  { label: <span>m<sup>3</sup></span>, value: "m3" },
  { label: "nrs", value: "nrs" },
  { label: "item", value: "item" },
  { label: "kg", value: "kg" },
  { label: "tons", value: "tons" },
];

const UnitSelector: React.FC<UnitSelectorProps> = ({
  selectedUnit,
  onChange,
  className = "",
}) => {
  return (
    <div className={`flex border border-border rounded-md overflow-hidden bg-surface w-full ${className}`}>
      {units.map((unit, i) => (
        <button
          key={unit.value}
          onClick={() => onChange(unit.value)}
          className={`flex-1 py-1.5 px-2 text-sm font-medium transition-all duration-200 cursor-pointer ${
            selectedUnit === unit.value
              ? "bg-accent text-accent-fg"
              : "text-muted hover:bg-overlay/5 bg-surface"
          } ${i !== units.length - 1 ? "border-r border-border" : ""}`}
        >
          {unit.label}
        </button>
      ))}
    </div>
  );
};

export default UnitSelector;
