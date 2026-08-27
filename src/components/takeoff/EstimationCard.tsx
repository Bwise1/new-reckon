import React, { useMemo, useState, useRef } from "react";
import { Copy, Link2, RotateCcw, Trash2, X } from "lucide-react";
import UnitSelector from "./UnitSelector";
import FormulaInput, { type FormulaInputHandle } from "./FormulaInput";
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
  /** Called when the user clicks the Measure toolbar button.
   * Parent toggles boqTargeting for this card. */
  onToggleMeasure?: () => void;
  /** Called when the user clicks Add or Deduct in the toolbar. When
   * this card is the current measure target, the parent uses this to
   * update boqTargeting.mode so the next measured value picks up the
   * correct sign. */
  onMeasureModeChange?: (mode: "add" | "deduct") => void;
  /** True when the store's boqTargeting matches this card. Renders a
   * highlighted ring to make the "you're measuring for THIS" affordance clear. */
  isTargeting?: boolean;
  /** Running total of all measurements drawn in this session.
   * Updates live during measuring; keeps the value in the takeoff box
   * after Exit until the user commits via Add/Deduct. */
  pendingMeasuredValue?: string | null;
  /** The stashed measuring-session snapshot targeting THIS card
   * (after Exit but before Add/Deduct commit). null when none pending. */
  pendingCommitBundle?: {
    elementId: string;
    itemId: string;
    value: string;
    total: number;
    measurementIds: string[];
    sessionId: string;
  } | null;
  /** Commit the pending measuring session as one history chip with all
   * measurements bound. `expression` is the (possibly edited) takeoff value
   * to store on the chip. Called instead of the local pushHistory path when
   * the takeoff input holds a staged, drawn session. */
  onSessionCommit?: (mode: "add" | "deduct", expression: string) => void;
  /** Clears the staged measured value (called after commit or Esc). */
  onClearPendingMeasured?: () => void;
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
  onToggleMeasure,
  onMeasureModeChange,
  isTargeting = false,
  pendingMeasuredValue = null,
  pendingCommitBundle = null,
  onSessionCommit,
  onClearPendingMeasured,
  className = "",
}) => {
  const [unit, setUnit] = useState<UnitType>(data?.unit || "m3");
  const [header, setHeader] = useState(data?.header || "");
  const [description, setDescription] = useState(data?.description || "");
  const [takeoff, setTakeoff] = useState("");
  const [rate, setRate] = useState(() => formatRateDisplay(data?.rate ?? 0));
  const [isEditingRate, setIsEditingRate] = useState(false);
  const formulaInputRef = useRef<FormulaInputHandle>(null);
  // Derived directly from the store-backed prop (not cloned into local state)
  // so entries written by other flows (e.g. bindMeasurementToItem when a
  // second measurement is staged before the first is committed) are never
  // clobbered by a stale local snapshot on the next commit.
  const history = data?.history || [];

  const qty = useMemo(() => formatQtyDisplay(computeQtyFromHistory(history)), [history]);

  const syncToParent = (patch: Partial<EstimationCardData>) => {
    onUpdate?.(data?.id || "", patch);
  };

  const pushHistory = (nextHistory: HistoryItem[]) => {
    syncToParent({
      history: nextHistory,
      qty: formatQtyDisplay(computeQtyFromHistory(nextHistory)),
    });
  };

  // Sync the takeoff input to whatever the store currently holds as the
  // pending value — either the live-updating running total while measuring
  // (boqTargeting.pendingValue) or the stashed value after Exit
  // (pendingCommit.value). Both flow into this component as pendingMeasuredValue.
  React.useEffect(() => {
    if (pendingMeasuredValue !== null) {
      setTakeoff(pendingMeasuredValue);
    }
  }, [pendingMeasuredValue]);

  // Clear the input once the pending value has gone away (after commit or
  // after a full discard). Not tied to isTargeting — the value must survive
  // Exit so the user can commit it later via Add/Deduct.
  React.useEffect(() => {
    if (pendingMeasuredValue === null) {
      setTakeoff("");
    }
  }, [pendingMeasuredValue]);

  // When the drawing session ends (isTargeting: true → false) with a
  // pending commit still on this card, move keyboard focus into the
  // takeoff input so the user can immediately hit Enter/Add/Deduct or
  // edit the value without a click.
  const wasTargetingRef = useRef(false);
  React.useEffect(() => {
    if (wasTargetingRef.current && !isTargeting && pendingCommitBundle) {
      formulaInputRef.current?.focus();
    }
    wasTargetingRef.current = isTargeting;
  }, [isTargeting, pendingCommitBundle]);

  const handleCommitTakeoff = (expression: string, mode: "add" | "deduct") => {
    // If there's a staged measuring session on this card, commit it as ONE
    // chip that BINDS the drawn measurements — even if the user edited the
    // expression (e.g. drew 13733.91 then typed "+ 76"). The edited expression
    // becomes the chip value. This prevents the old duplicate-chip bug where
    // the draw auto-committed one chip and the edit committed a second.
    if (pendingCommitBundle && onSessionCommit) {
      onSessionCommit(mode, expression);
      return;
    }
    // Purely manual commit — no drawn measurement staged, user typed a value.
    const entry: HistoryItem = {
      id: generateClientId(),
      value: expression,
      isDeduct: mode === "deduct",
    };
    pushHistory([...history, entry]);
    onClearPendingMeasured?.();
  };

  const removeHistoryItem = (itemId: string) => {
    pushHistory(history.filter((item) => item.id !== itemId));
  };

  // Remove every entry from one merged chip at once. We delete by the exact
  // member ids rather than by groupId, because legacy grouped entries (bound
  // measurements with no groupId) are bucketed under a synthetic key that
  // never matches item.groupId — so a groupId filter deleted nothing.
  const removeHistoryGroup = (itemIds: string[]) => {
    const idSet = new Set(itemIds);
    pushHistory(history.filter((item) => !idSet.has(item.id)));
  };

  // Entries sharing a groupId (one continuous measuring session) collapse
  // into a single displayed chip showing their summed value. Entries with
  // sourceMeasurementId but no groupId (legacy data from old code) are also
  // collapsed into one chip showing their sum.
  type DisplayRow =
    | { kind: "single"; item: HistoryItem }
    | { kind: "group"; groupId: string; items: HistoryItem[]; isDeduct: boolean };

  const displayRows = useMemo<DisplayRow[]>(() => {
    const rows: DisplayRow[] = [];
    const groupIndex = new Map<string, number>();
    // Key used to bucket legacy bound entries that have no groupId.
    const LEGACY_BOUND_KEY = "__legacy_bound__";

    history.forEach((item) => {
      // New-style: explicit groupId.
      if (item.groupId) {
        const existingIndex = groupIndex.get(item.groupId);
        if (existingIndex === undefined) {
          groupIndex.set(item.groupId, rows.length);
          rows.push({ kind: "group", groupId: item.groupId, items: [item], isDeduct: !!item.isDeduct });
        } else {
          const existing = rows[existingIndex];
          if (existing.kind === "group") existing.items.push(item);
        }
        return;
      }
      // Legacy: bound to a measurement but no groupId — collapse with others like it.
      if (item.sourceMeasurementId) {
        const existingIndex = groupIndex.get(LEGACY_BOUND_KEY);
        if (existingIndex === undefined) {
          groupIndex.set(LEGACY_BOUND_KEY, rows.length);
          rows.push({ kind: "group", groupId: LEGACY_BOUND_KEY, items: [item], isDeduct: !!item.isDeduct });
        } else {
          const existing = rows[existingIndex];
          if (existing.kind === "group") existing.items.push(item);
        }
        return;
      }
      // Manual entry — always its own chip.
      rows.push({ kind: "single", item });
    });
    // A "group" of exactly one entry has nothing to merge — show it plainly.
    return rows.flatMap((row) =>
      row.kind === "group" && row.items.length === 1
        ? [{ kind: "single" as const, item: row.items[0] }]
        : [row]
    );
  }, [history]);

  const updateUnit = (newUnit: UnitType) => {
    setUnit(newUnit);
    syncToParent({ unit: newUnit });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onFocus?.();
      }}
      className={`rounded-lg border p-3 space-y-2.5 transition-all cursor-pointer overflow-visible ${
        isTargeting
          ? "border-accent bg-accent/5 shadow-md ring-2 ring-accent/40"
          : isActive
          ? "border-border bg-surface-muted/50 shadow-sm"
          : "border-border bg-surface-muted opacity-55 hover:opacity-80"
      } ${className}`}
    >
      <div onClick={(e) => e.stopPropagation()} className="space-y-2.5">
        <UnitSelector selectedUnit={unit} onChange={updateUnit} />

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
            ref={formulaInputRef}
            value={takeoff}
            onChange={setTakeoff}
            onCommit={handleCommitTakeoff}
            onFocus={onFocus}
            onToggleMeasure={onToggleMeasure}
            onModeChange={onMeasureModeChange}
            isMeasuring={isTargeting}
            placeholder="Takeoff (e.g. 250 or 10*3*1 + 5*3*1)"
            className="w-full"
          />
        </div>

        {displayRows.length > 0 && (
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              {displayRows.map((row, idx) => {
                const isDeduct =
                  row.kind === "single" ? !!row.item.isDeduct : row.isDeduct;
                // Show the expression that was entered, not the collapsed
                // total. A grouped chip (one measuring session with several
                // measurements) joins each entry's raw value with " + " so the
                // user sees e.g. "472.24 + 245.63" rather than "717.87".
                const displayValue =
                  row.kind === "single"
                    ? row.item.value
                    : row.items.map((it) => it.value).join(" + ");
                const key = row.kind === "single" ? row.item.id : row.groupId;
                const onRemove =
                  row.kind === "single"
                    ? () => removeHistoryItem(row.item.id)
                    : () => removeHistoryGroup(row.items.map((it) => it.id));
                const isBound =
                  row.kind === "group" ||
                  (row.kind === "single" && !!row.item.sourceMeasurementId);
                return (
                  <React.Fragment key={key}>
                    {idx > 0 && (
                      <span className="text-xs font-semibold text-muted">
                        {isDeduct ? "−" : "+"}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium ${
                        isDeduct
                          ? "bg-surface text-danger"
                          : isBound
                            ? "bg-overlay/10 text-body"
                            : "bg-surface text-body"
                      }`}
                      title={
                        row.kind === "group"
                          ? `${row.items.length} measurements combined`
                          : undefined
                      }
                    >
                      {isBound && <Link2 className="h-3 w-3 shrink-0" strokeWidth={2} />}
                      <span className="tabular-nums">{displayValue}</span>
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={onRemove}
                        className="text-muted hover:text-danger transition-colors cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 min-w-0 pt-0.5">
          <div className="min-w-0 flex flex-1 items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 overflow-hidden">
            <span className="text-xs font-medium text-muted shrink-0">Qty</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-right text-sm font-semibold text-body tabular-nums">
                {qty}
              </span>
              <span className="text-muted shrink-0">|</span>
              <span className="text-xs font-medium text-muted shrink-0">
                {unit === 'm2' ? 'm²' : unit === 'm3' ? 'm³' : unit}
              </span>
            </span>
          </div>
          <div className="min-w-0 flex flex-1 items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 overflow-hidden">
            <span className="text-xs font-medium text-muted shrink-0">Rate</span>
            <span className="text-sm font-medium text-muted shrink-0">₦</span>
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
              className="flex-1 min-w-0 w-0 text-right text-sm text-body outline-none bg-transparent"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 text-xs font-medium text-muted">
            <span>Add:</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddElement?.();
              }}
              className="hover:text-body transition-colors cursor-pointer"
            >
              Element
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddItem?.();
              }}
              className="hover:text-body transition-colors cursor-pointer"
            >
              Item
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Reset the item's takeoff: clear all history chips and qty
                // (keeps the item, its header, description, unit and rate).
                pushHistory([]);
                onClearPendingMeasured?.();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-body transition-colors cursor-pointer"
              title="Reset takeoff (clear history)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopy?.(data?.id || "");
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-body transition-colors cursor-pointer"
              title="Duplicate"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(data?.id || "");
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-danger/10 hover:text-danger transition-colors cursor-pointer"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EstimationCard;
