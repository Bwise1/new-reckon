import React from "react";
import { ChevronDown } from "lucide-react";
import { FiUser } from "react-icons/fi";
import EstimationCard from "./EstimationCard";
import BoqExportModal from "./BoqExportModal";
import SyncStatusBadge from "@/components/ui/SyncStatusBadge";
import { useShallow } from "zustand/react/shallow";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import { useAuthStore } from "@/stores/auth.store";
import { useBoqExport } from "@/hooks/useBoqExport";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import type { EstimationCardData } from "@/types/takeoff";
import { itemLabelFromIndex } from "@/utils/boqCalculations";

interface TakeoffRightSidebarProps {
  className?: string;
}

const TakeoffRightSidebar: React.FC<TakeoffRightSidebarProps> = ({
  className = "",
}) => {
  const user = useAuthStore((state) => state.user);
  const {
    exportModalMode,
    setExportModalMode,
    busyAction,
    statusMessage,
    pricing,
    handleExportConfirm,
  } = useBoqExport();
  const { isOnline } = useSyncStatus();

  // Shallow selector, not a whole-store subscription: canvas measurements
  // mutate the store constantly and would re-render this whole sidebar.
  const {
    boqElements,
    addBoqElement,
    updateBoqElement,
    addElementItem,
    updateElementItem,
    deleteElementItem,
    duplicateElementItem,
    boqTargeting,
    pendingCommit,
    startBoqTargeting,
    exitBoqTargeting,
    setBoqTargetingMode,
    setBoqTargetingPending,
    clearPendingCommit,
    bindMeasurementToItem,
    setFocusedBoqCard,
  } = useTakeoffStore(
    useShallow((s) => ({
      boqElements: s.boqElements,
      addBoqElement: s.addBoqElement,
      updateBoqElement: s.updateBoqElement,
      addElementItem: s.addElementItem,
      updateElementItem: s.updateElementItem,
      deleteElementItem: s.deleteElementItem,
      duplicateElementItem: s.duplicateElementItem,
      boqTargeting: s.boqTargeting,
      pendingCommit: s.pendingCommit,
      startBoqTargeting: s.startBoqTargeting,
      exitBoqTargeting: s.exitBoqTargeting,
      setBoqTargetingMode: s.setBoqTargetingMode,
      setBoqTargetingPending: s.setBoqTargetingPending,
      clearPendingCommit: s.clearPendingCommit,
      bindMeasurementToItem: s.bindMeasurementToItem,
      setFocusedBoqCard: s.setFocusedBoqCard,
    }))
  );

  const [expandedElements, setExpandedElements] = React.useState<Record<string, boolean>>({});
  const [activeElementId, setActiveElementId] = React.useState<string | null>(null);
  const [activeCardId, setActiveCardId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (boqElements.length === 0) {
      setActiveElementId(null);
      setActiveCardId(null);
      setFocusedBoqCard(null);
      return;
    }

    // Only clear a selection that pointed at something now deleted — never
    // auto-select a default card. Nothing should read as "active" until the
    // user actually clicks a card.
    const element = activeElementId
      ? boqElements.find((e) => e.id === activeElementId)
      : undefined;
    if (activeElementId && !element) {
      setActiveElementId(null);
      setActiveCardId(null);
      setFocusedBoqCard(null);
    } else if (element && activeCardId && !element.items.some((item) => item.id === activeCardId)) {
      setActiveCardId(null);
      setFocusedBoqCard(null);
    }

    setExpandedElements((prev) => {
      const next = { ...prev };
      for (const el of boqElements) {
        if (next[el.id] === undefined) next[el.id] = true;
      }
      return next;
    });
  }, [boqElements, activeElementId, activeCardId]);

  const handleAddElement = () => {
    addBoqElement();
    const latest = useTakeoffStore.getState().boqElements;
    const created = latest[latest.length - 1];
    if (created) {
      setActiveElementId(created.id);
      setActiveCardId(created.items[0]?.id ?? null);
      setExpandedElements((prev) => ({ ...prev, [created.id]: true }));
    }
  };

  const handleAddItem = (elementId: string) => {
    addElementItem(elementId);
    const element = useTakeoffStore.getState().boqElements.find((e) => e.id === elementId);
    const newItem = element?.items[element.items.length - 1];
    if (newItem) {
      setActiveElementId(elementId);
      setActiveCardId(newItem.id);
      setExpandedElements((prev) => ({ ...prev, [elementId]: true }));
    }
  };

  const handleDeleteItem = (elementId: string, itemId: string) => {
    deleteElementItem(elementId, itemId);
  };

  const handleCopyItem = (elementId: string, itemId: string) => {
    duplicateElementItem(elementId, itemId);
    const element = useTakeoffStore.getState().boqElements.find((e) => e.id === elementId);
    const sourceIndex = element?.items.findIndex((i) => i.id === itemId) ?? -1;
    const copy = sourceIndex >= 0 ? element?.items[sourceIndex + 1] : undefined;
    if (copy) setActiveCardId(copy.id);
  };

  const handleUpdateItem = (
    elementId: string,
    itemId: string,
    updates: Partial<EstimationCardData>
  ) => {
    updateElementItem(elementId, itemId, updates);
  };

  const displayName = user?.name || user?.email?.split("@")[0] || "User";

  return (
    <div
      className={`w-[380px] min-w-[380px] max-w-[380px] shrink-0 h-full flex flex-col bg-white border-l border-gray-200 overflow-hidden ${className}`}
    >
      <div className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-full bg-brandGold flex items-center justify-center shrink-0 overflow-hidden"
          title={displayName}
        >
          <FiUser className="text-secondary text-xl" />
        </div>

        <div className="flex-1 min-w-0 flex justify-center">
          <SyncStatusBadge />
        </div>

        <button
          type="button"
          onClick={() => setExportModalMode("export")}
          disabled={busyAction || !isOnline}
          title={!isOnline ? "Export requires an internet connection" : undefined}
          className="shrink-0 px-5 py-2 rounded-lg bg-secondary text-white text-sm font-bold hover:bg-[#002847] disabled:opacity-50 shadow-sm cursor-pointer disabled:cursor-not-allowed"
        >
          Export
        </button>
      </div>

      {statusMessage && (
        <p className="shrink-0 px-4 py-1.5 text-[11px] text-gray-500 border-b border-gray-50 bg-gray-50">
          {statusMessage}
        </p>
      )}

      <div
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar"
        onClick={(e) => {
          // Clicking empty space (not a card, not a control inside one)
          // exits measuring mode so the floating toolbar closes. Clicks on
          // cards/canvas are handled separately and retarget instead.
          if (e.target === e.currentTarget && boqTargeting) {
            exitBoqTargeting();
          }
        }}
      >
        {boqElements.map((element) => {
          const isExpanded = expandedElements[element.id] ?? true;

          return (
            <div key={element.id} className="border-b border-gray-100">
              <button
                type="button"
                onClick={() =>
                  setExpandedElements((prev) => ({
                    ...prev,
                    [element.id]: !isExpanded,
                  }))
                }
                className="w-full px-4 py-3 flex items-center justify-between shrink-0 hover:bg-gray-50/80 cursor-pointer"
              >
                <span className="text-lg font-bold text-gray-900 flex items-center gap-1.5 min-w-0">
                  <input
                    type="text"
                    value={
                      element.title
                        ? element.title.charAt(0).toUpperCase() + element.title.slice(1)
                        : element.title
                    }
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      // Store with the first letter capitalized (sentence case).
                      const v = e.target.value;
                      updateBoqElement(element.id, {
                        title: v ? v.charAt(0).toUpperCase() + v.slice(1) : v,
                      });
                    }}
                    className="bg-transparent border-none outline-none font-bold text-lg text-gray-900 min-w-0 flex-1"
                  />
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-gray-500 transition-transform shrink-0 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-3">
                  {element.items.map((card, index) => {
                    const isTargetingThis =
                      boqTargeting?.elementId === element.id &&
                      boqTargeting?.itemId === card.id;
                    const pendingCommitForThis =
                      pendingCommit?.elementId === element.id &&
                      pendingCommit?.itemId === card.id
                        ? pendingCommit
                        : null;
                    // Commit bundle for Add/Deduct. Commit-on-demand: while
                    // actively measuring this card, the drawn measurements are
                    // staged in boqTargeting (no chip yet) — expose them as the
                    // bundle so Add/Deduct binds them into ONE chip. Otherwise
                    // fall back to the stashed post-Exit pendingCommit.
                    const commitBundleForThis =
                      isTargetingThis && boqTargeting
                        ? {
                            elementId: boqTargeting.elementId,
                            itemId: boqTargeting.itemId,
                            value: boqTargeting.pendingValue ?? '',
                            total: boqTargeting.pendingTotal,
                            measurementIds: boqTargeting.pendingMeasurementIds,
                            sessionId: boqTargeting.sessionId,
                          }
                        : pendingCommitForThis;
                    // Live-updating value while measuring; stashed value after Exit.
                    const displayPendingValue = isTargetingThis
                      ? boqTargeting?.pendingValue ?? null
                      : pendingCommitForThis?.value ?? null;
                    return (
                    <EstimationCard
                      key={card.id}
                      data={card}
                      itemLabel={itemLabelFromIndex(index)}
                      isActive={
                        activeElementId === element.id && activeCardId === card.id
                      }
                      isTargeting={isTargetingThis}
                      pendingMeasuredValue={displayPendingValue}
                      pendingCommitBundle={commitBundleForThis}
                      onSessionCommit={(mode, expression) => {
                        if (!commitBundleForThis) return;
                        // Bind the staged measurements as one chip, using the
                        // possibly-edited expression (e.g. "13733.91 + 76") as
                        // the chip value so typed math is preserved.
                        bindMeasurementToItem(
                          commitBundleForThis.measurementIds,
                          commitBundleForThis.elementId,
                          commitBundleForThis.itemId,
                          mode,
                          expression ?? commitBundleForThis.value,
                          commitBundleForThis.sessionId,
                        );
                        clearPendingCommit();
                        // Clear the live session too so the input resets and no
                        // second chip can be made from the same measurements.
                        setBoqTargetingPending(null, []);
                      }}
                      onClearPendingMeasured={() => {
                        // Clear both the live-measuring pending value (if any)
                        // and the stashed post-Exit pendingCommit (if any).
                        // Manual commits should discard the drawn-session
                        // total since the user typed their own value.
                        setBoqTargetingPending(null, []);
                        if (pendingCommitForThis) clearPendingCommit();
                      }}
                      onFocus={() => {
                        setActiveElementId(element.id);
                        setActiveCardId(card.id);
                        setFocusedBoqCard({ elementId: element.id, itemId: card.id, unit: card.unit });
                      }}
                      onToggleMeasure={() => {
                        setActiveElementId(element.id);
                        setActiveCardId(card.id);
                        const isThisCardTargeted =
                          boqTargeting?.elementId === element.id &&
                          boqTargeting?.itemId === card.id;
                        if (isThisCardTargeted) {
                          exitBoqTargeting();
                        } else {
                          startBoqTargeting(element.id, card.id, card.unit);
                        }
                      }}
                      onMeasureModeChange={(mode) => {
                        // Only update targeting if THIS card is the target.
                        const isThisCardTargeted =
                          boqTargeting?.elementId === element.id &&
                          boqTargeting?.itemId === card.id;
                        if (isThisCardTargeted) setBoqTargetingMode(mode);
                      }}
                      onDelete={(itemId) => handleDeleteItem(element.id, itemId)}
                      onCopy={(itemId) => handleCopyItem(element.id, itemId)}
                      onUpdate={(itemId, updates) =>
                        handleUpdateItem(element.id, itemId, updates)
                      }
                      onAddElement={handleAddElement}
                      onAddItem={() => handleAddItem(element.id)}
                    />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <BoqExportModal
        key={`${exportModalMode}-${pricing.vatRate}-${pricing.contingency}`}
        open={exportModalMode !== null}
        mode="export"
        initialVat={pricing.vatRate}
        initialContingency={pricing.contingency}
        busy={busyAction}
        onClose={() => setExportModalMode(null)}
        onConfirm={handleExportConfirm}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default TakeoffRightSidebar;
