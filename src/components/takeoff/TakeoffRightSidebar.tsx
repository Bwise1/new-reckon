import React from "react";
import { ChevronDown } from "lucide-react";
import { FiUser } from "react-icons/fi";
import EstimationCard from "./EstimationCard";
import BoqExportModal from "./BoqExportModal";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import { useAuthStore } from "@/stores/auth.store";
import { useBoqExport } from "@/hooks/useBoqExport";
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

  const {
    boqElements,
    addBoqElement,
    updateBoqElement,
    addElementItem,
    updateElementItem,
    deleteElementItem,
    duplicateElementItem,
  } = useTakeoffStore();

  const [expandedElements, setExpandedElements] = React.useState<Record<string, boolean>>({});
  const [activeElementId, setActiveElementId] = React.useState<string | null>(null);
  const [activeCardId, setActiveCardId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (boqElements.length === 0) {
      setActiveElementId(null);
      setActiveCardId(null);
      return;
    }

    const elementStillExists = activeElementId && boqElements.some((e) => e.id === activeElementId);
    const resolvedElementId = elementStillExists ? activeElementId! : boqElements[0].id;
    const element = boqElements.find((e) => e.id === resolvedElementId)!;

    const cardStillExists =
      activeCardId && element.items.some((item) => item.id === activeCardId);
    const resolvedCardId = cardStillExists ? activeCardId! : element.items[0]?.id ?? null;

    if (resolvedElementId !== activeElementId) setActiveElementId(resolvedElementId);
    if (resolvedCardId !== activeCardId) setActiveCardId(resolvedCardId);

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

        <div className="flex-1 min-w-0" />

        <button
          type="button"
          onClick={() => setExportModalMode("preview")}
          disabled={busyAction}
          className="text-sm font-semibold text-gray-800 hover:text-secondary disabled:opacity-50 shrink-0 cursor-pointer disabled:cursor-not-allowed"
        >
          Preview
        </button>

        <button
          type="button"
          onClick={() => setExportModalMode("export")}
          disabled={busyAction}
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

      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
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
                  <span className="text-gray-500 font-normal shrink-0">&gt;</span>
                  <input
                    type="text"
                    value={element.title}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      updateBoqElement(element.id, { title: e.target.value })
                    }
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
                  {element.items.map((card, index) => (
                    <EstimationCard
                      key={card.id}
                      data={card}
                      itemLabel={itemLabelFromIndex(index)}
                      isActive={
                        activeElementId === element.id && activeCardId === card.id
                      }
                      onFocus={() => {
                        setActiveElementId(element.id);
                        setActiveCardId(card.id);
                      }}
                      onDelete={(itemId) => handleDeleteItem(element.id, itemId)}
                      onCopy={(itemId) => handleCopyItem(element.id, itemId)}
                      onUpdate={(itemId, updates) =>
                        handleUpdateItem(element.id, itemId, updates)
                      }
                      onAddElement={handleAddElement}
                      onAddItem={() => handleAddItem(element.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <BoqExportModal
        key={`${exportModalMode}-${pricing.vatRate}-${pricing.contingency}`}
        open={exportModalMode !== null}
        mode={exportModalMode ?? "preview"}
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
