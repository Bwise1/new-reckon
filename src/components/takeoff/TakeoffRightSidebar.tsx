import React from "react";
import { ChevronRight, Plus, Info } from "lucide-react";
import EstimationCard from "./EstimationCard";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import type { EstimationCardData } from "@/types/takeoff";

interface TakeoffRightSidebarProps {
  className?: string;
}

const TakeoffRightSidebar: React.FC<TakeoffRightSidebarProps> = ({
  className = "",
}) => {
  const { estimationCards, addEstimationCard, updateEstimationCard, deleteEstimationCard } = useTakeoffStore();

  const handleAddCard = () => {
    const newCard: EstimationCardData = {
      id: Math.random().toString(36).substr(2, 9),
      unit: "m2",
      header: "New Manual Takeoff",
      description: "Enter a brief description of the takeoff item here.",
      qty: "0",
      rate: "0.00",
      history: []
    };
    addEstimationCard(newCard);
  };

  const handleDeleteCard = (id: string) => {
    deleteEstimationCard(id);
  };

  const handleCopyCard = (id: string) => {
    const cardToCopy = estimationCards.find(card => card.id === id);
    if (cardToCopy) {
      const newCard = {
        ...cardToCopy,
        id: Math.random().toString(36).substr(2, 9),
        header: `${cardToCopy.header} (Copy)`
      };
      addEstimationCard(newCard);
    }
  };

  const handleUpdateCard = (id: string, updates: Partial<EstimationCardData>) => {
    updateEstimationCard(id, updates);
  };

  return (
    <div className={`w-[300px] h-full flex flex-col bg-[#f8fafb] border-l border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1 bg-[#2da1a1]/10 rounded-lg">
            <ChevronRight className="w-5 h-5 text-[#2da1a1]" />
          </div>
          <div>
            <h2 className="font-bold text-gray-800 text-sm">Manual Takeoff</h2>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Item Details</p>
          </div>
        </div>
        <button
          onClick={handleAddCard}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2da1a1] text-white rounded-xl hover:bg-[#258a8a] transition-all shadow-md shadow-[#2da1a1]/20 group"
          title="Add New Card"
        >
          <Plus className="w-4 h-4 group-active:scale-90 transition-transform" />
          <span className="text-xs font-bold">New Item</span>
        </button>
      </div>

      {/* Info Banner */}
      <div className="px-4 py-2 bg-[#2da1a1]/5 flex items-center gap-2 border-b border-[#2da1a1]/10 shrink-0">
        <Info className="w-3 h-3 text-[#2da1a1]" />
        <span className="text-[10px] text-[#2da1a1] font-semibold">Enter quantities manually or use the formula bar.</span>
      </div>

      {/* Cards List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {estimationCards.map((card) => (
          <EstimationCard
            key={card.id}
            data={card}
            onDelete={handleDeleteCard}
            onCopy={handleCopyCard}
            onUpdate={handleUpdateCard}
          />
        ))}

        {estimationCards.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 opacity-70 p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <Plus className="w-8 h-8 text-gray-300" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-gray-500">No manual items yet</p>
              <p className="text-xs">Click "New Item" to start adding manual takeoff entries.</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-white border-t border-gray-100 mt-auto shrink-0">
        <div className="flex justify-between items-center text-[11px] font-bold text-gray-400">
          <span>Total Items: {estimationCards.length}</span>
          <span className="text-[#2da1a1]/80 italic">Ready for Export</span>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
};

export default TakeoffRightSidebar;
