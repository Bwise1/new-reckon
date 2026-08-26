import React, { useEffect, useRef, useState } from "react";
import { Plus, MoreHorizontal } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useTakeoffStore } from "@/store/useTakeoffStore";
import type { BoqElementData } from "@/types/takeoff";

const parseNum = (value: string | undefined): number => {
  const n = parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const billTotal = (elements: BoqElementData[]): number =>
  elements.reduce(
    (sum, el) =>
      sum +
      el.items.reduce(
        (itemSum, item) => itemSum + parseNum(item.qty) * parseNum(item.rate),
        0
      ),
    0
  );

const formatAmount = (value: number): string =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface BillsOverviewProps {
  /** Open a bill's element view. */
  onOpenBill: (billId: string) => void;
}

/**
 * The bill list page (Reckon-Bill prototype layout): grand total card, one row
 * per bill with its own total, and an Add Bill button. Clicking a row opens
 * that bill's elements.
 */
const BillsOverview: React.FC<BillsOverviewProps> = ({ onOpenBill }) => {
  const { bills, addBill, renameBill, duplicateBill, deleteBill, collectBills } =
    useTakeoffStore(
      useShallow((s) => ({
        bills: s.bills,
        addBill: s.addBill,
        renameBill: s.renameBill,
        duplicateBill: s.duplicateBill,
        deleteBill: s.deleteBill,
        collectBills: s.collectBills,
      }))
    );

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuFor(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFor]);

  const commitRename = () => {
    if (editingId && draftName.trim()) renameBill(editingId, draftName.trim());
    setEditingId(null);
  };

  const withElements = collectBills();
  const grandTotal = withElements.reduce(
    (sum, bill) => sum + billTotal(bill.elements),
    0
  );

  return (
    <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 py-4 space-y-4">
      {/* Grand total */}
      <div className="rounded-xl bg-surface-muted border border-border px-4 py-3">
        <p className="text-[11px] font-bold tracking-wide text-muted/70 uppercase">
          Grand Total Project Cost
        </p>
        <p className="text-2xl font-extrabold text-body">
          ₦ {formatAmount(grandTotal)}
        </p>
      </div>

      {/* Bill rows */}
      <div className="rounded-xl border border-border divide-y divide-border overflow-visible">
        {withElements.map((bill, idx) => (
          <div key={bill.id} className="relative">
            {editingId === bill.id ? (
              <div className="px-4 py-3">
                <p className="text-[11px] font-bold tracking-wide text-muted/70 uppercase">
                  Bill {idx + 1}
                </p>
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="mt-0.5 w-full px-2 py-1 rounded-md border border-secondary text-lg font-bold outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenBill(bill.id)}
                className="w-full text-left px-4 py-3 hover:bg-overlay/5 transition-colors cursor-pointer"
              >
                <p className="text-[11px] font-bold tracking-wide text-muted/70 uppercase">
                  Bill {idx + 1}
                </p>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-lg font-bold text-body truncate">
                    {bill.name}
                  </span>
                  <span className="shrink-0 text-base font-bold text-body">
                    ₦ {formatAmount(billTotal(bill.elements))}
                  </span>
                </span>
              </button>
            )}

            <button
              type="button"
              aria-label={`Actions for ${bill.name}`}
              onClick={() => setMenuFor(menuFor === bill.id ? null : bill.id)}
              className="absolute top-2.5 right-2 p-1 rounded text-muted/50 hover:text-body hover:bg-overlay/10 cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {menuFor === bill.id && (
              <div
                ref={menuRef}
                className="absolute right-2 top-9 z-40 w-36 rounded-lg border border-border bg-surface py-1 shadow-lg text-xs font-medium"
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuFor(null);
                    setEditingId(bill.id);
                    setDraftName(bill.name);
                  }}
                  className="block w-full px-3 py-1.5 text-left hover:bg-overlay/5 cursor-pointer"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuFor(null);
                    duplicateBill(bill.id);
                  }}
                  className="block w-full px-3 py-1.5 text-left hover:bg-overlay/5 cursor-pointer"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  disabled={bills.length <= 1}
                  onClick={() => {
                    setMenuFor(null);
                    if (window.confirm(`Delete "${bill.name}" and all its elements?`)) {
                      deleteBill(bill.id);
                    }
                  }}
                  className="block w-full px-3 py-1.5 text-left text-danger hover:bg-danger/10 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add bill */}
      <button
        type="button"
        onClick={() => addBill()}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-secondary text-white py-3 text-sm font-bold hover:bg-[#002847] transition-colors cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        Add Bill
      </button>
    </div>
  );
};

export default BillsOverview;
