import React, { useMemo, useState } from "react";
import { Copy, Trash2, X } from "lucide-react";
import UnitSelector from "./UnitSelector";
import FormulaInput from "./FormulaInput";
import DescriptionField from "./DescriptionField";
import HeaderField from "./HeaderField";
import type { EstimationCardData, UnitType, HistoryItem } from "@/types/takeoff";
import { generateClientId } from "@/utils/id";
import {
  computeQtyFromHistory,
  formatQtyDisplay,
  formatRateDisplay,
  rateToEditString,
  sanitizeRateInput,
} from "@/utils/boqCalculations";

interface EstimationCardProps {
  data?: Partial<EstimationCardData>;
  itemLabel: string;
  onDelete?: (id: string) => void;
  onCopy?: (id: string) => void;
  onUpdate?: (id: string, data: Partial<EstimationCardData>) => void;
  onAddElement?: () => void;
  onAddItem?: () => void;
  isActive?: boolean;
  onFocus?: () => void;
  className?: string;
}

const EstimationCard: React.FC<EstimationCardProps> = ({
  data,
  itemLabel,
  onDelete,
  onCopy,
  onUpdate,
  onAddElement,
  onAddItem,
  isActive = true,
  onFocus,
  className = "",
}) => {
  const [unit, setUnit] = useState<UnitType>(data?.unit || "m3");
  const [header, setHeader] = useState(data?.header || "");
  const [description, setDescription] = useState(data?.description || "");
  const [takeoff, setTakeoff] = useState("");
  const [rate, setRate] = useState(() => formatRateDisplay(data?.rate ?? 0));
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(data?.history || []);

  const qty = useMemo(() => formatQtyDisplay(computeQtyFromHistory(history)), [history]);

  const syncToParent = (patch: Partial<EstimationCardData>) => {
    onUpdate?.(data?.id || "", patch);
  };

  const pushHistory = (nextHistory: HistoryItem[]) => {
    setHistory(nextHistory);
    syncToParent({
      history: nextHistory,
      qty: formatQtyDisplay(computeQtyFromHistory(nextHistory)),
    });
  };

  const handleCommitTakeoff = (expression: string, mode: "add" | "deduct") => {
    const entry: HistoryItem = {
      id: generateClientId(),
      value: expression,
      isDeduct: mode === "deduct",
    };
    pushHistory([...history, entry]);
  };

  const removeHistoryItem = (itemId: string) => {
    pushHistory(history.filter((item) => item.id !== itemId));
  };

  const updateUnit = (newUnit: UnitType) => {
    setUnit(newUnit);
    syncToParent({ unit: newUnit });
  };

  const unitDisplay = unit === "m2" ? "m²" : unit === "m3" ? "m³" : unit;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onFocus?.();
      }}
      className={`rounded-[10px] border px-4 pb-4 pt-0 space-y-3 transition-all cursor-pointer overflow-visible ${
        isActive
          ? "border-[#289693] bg-[#289693]/5 shadow-sm"
          : "border-gray-200 bg-gray-50 opacity-55 hover:opacity-80"
      } ${className}`}
    >
      <div onClick={(e) => e.stopPropagation()} className="space-y-3">
        <UnitSelector selectedUnit={unit} onChange={updateUnit} className="mt-3" />

        <HeaderField
          value={header}
          onChange={(value) => {
            setHeader(value);
            syncToParent({ header: value });
          }}
        />

        <DescriptionField
          itemLabel={itemLabel}
          value={description}
          onChange={(value) => {
            setDescription(value);
            syncToParent({ description: value });
          }}
        />

        <div className="relative z-10">
          <FormulaInput
            value={takeoff}
            onChange={setTakeoff}
            onCommit={handleCommitTakeoff}
            placeholder="Takeoff (e.g. 250 or 10*3*1 + 5*3*1)"
            className="w-full"
          />
        </div>

        {history.length > 0 && (
          <div>
            <p className="text-[13px] font-bold text-[#1F1F1F] mb-1.5">History:</p>
            <div className="flex flex-wrap gap-1 items-center text-[11px]">
              {history.map((item, idx) => (
                <React.Fragment key={item.id}>
                  {idx > 0 && (
                    <span className="text-[#1F1F1F] font-semibold px-0.5">
                      {item.isDeduct ? "−" : "+"}
                    </span>
                  )}
                  <div
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] ${
                      item.isDeduct
                        ? "bg-red-50/80 border-red-100 text-red-500"
                        : idx === 0
                          ? "bg-gray-50 border-gray-200 text-gray-600"
                          : "bg-amber-50/80 border-amber-100 text-amber-700"
                    }`}
                  >
                    <span>{item.value}</span>
                    <button
                      type="button"
                      onClick={() => removeHistoryItem(item.id)}
                      className="opacity-60 hover:opacity-100 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 min-w-0">
          <div className="min-w-0 flex items-center gap-2 rounded-lg border border-[#D9D9D9] bg-white px-3 py-3 overflow-hidden">
            <span className="text-[13px] text-gray-400 shrink-0">Qty</span>
            <span className="flex-1 min-w-0 text-right text-[15px] font-bold text-[#003566] tabular-nums truncate">
              {qty}
            </span>
            <span className="text-gray-300 shrink-0">|</span>
            <span className="text-[13px] text-gray-400 shrink-0">{unitDisplay}</span>
          </div>
          <div className="min-w-0 flex items-center gap-1 rounded-lg border border-[#D9D9D9] bg-white px-3 py-3 overflow-hidden">
            <span className="text-[13px] text-gray-400 shrink-0">Rate</span>
            <span className="text-[15px] font-bold text-[#003566] shrink-0">₦</span>
            <input
              type="text"
              inputMode="decimal"
              value={isEditingRate ? rate : formatRateDisplay(rate)}
              onFocus={(e) => {
                setIsEditingRate(true);
                setRate(rateToEditString(rate));
                requestAnimationFrame(() => e.target.select());
              }}
              onChange={(e) => {
                const next = sanitizeRateInput(e.target.value);
                setRate(next);
                syncToParent({ rate: formatRateDisplay(next) });
              }}
              onBlur={() => {
                setIsEditingRate(false);
                const formatted = formatRateDisplay(rate);
                setRate(formatted);
                syncToParent({ rate: formatted });
              }}
              placeholder="0.00"
              className="flex-1 min-w-0 w-0 text-right text-[14px] font-bold text-[#003566] outline-none bg-transparent"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-[11px] font-bold text-gray-400">
            <span className="opacity-70">Add:</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddElement?.();
              }}
              className="underline hover:text-[#289693] transition-colors cursor-pointer"
            >
              Element
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddItem?.();
              }}
              className="underline hover:text-[#289693] transition-colors cursor-pointer"
            >
              Item
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopy?.(data?.id || "");
              }}
              className="p-1.5 text-gray-400 hover:text-[#289693] transition-colors cursor-pointer"
              title="Duplicate"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(data?.id || "");
              }}
              className="p-1.5 text-red-400 hover:text-red-600 transition-colors cursor-pointer"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EstimationCard;
