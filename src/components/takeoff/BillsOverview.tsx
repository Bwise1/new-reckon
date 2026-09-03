import React, { useState } from "react";
import { Plus, MoreHorizontal, Copy, Trash2, FileStack } from "lucide-react";
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

const CURRENCY = "₦";

interface BillsOverviewProps {
  /** Open a bill's element view. */
  onOpenBill: (billId: string) => void;
}

/**
 * The bills ledger (Reckon-Bill prototype, matched 1:1): grand-total strip,
 * one ledger of rows (caps label, live-editable name, per-bill total, hover
 * menu with Duplicate/Delete), and the Add Bill button.
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

  const withElements = collectBills();
  const grandTotal = withElements.reduce(
    (sum, bill) => sum + billTotal(bill.elements),
    0
  );

  return (
    <>
      {/* Grand financial summary strip */}
      <div className="shrink-0 px-3 pt-3">
        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Grand Total Project Cost
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-body">
            {CURRENCY} {formatAmount(grandTotal)}
          </p>
        </div>
      </div>

      {/* Bills ledger */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-3">
        {withElements.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <FileStack className="h-6 w-6 text-muted" strokeWidth={1.5} />
            <p className="text-sm text-muted">No bills yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {withElements.map((bill, index) => (
              <BillRow
                key={bill.id}
                label={`Bill ${index + 1}`}
                name={
                  lookupBillName(bills, bill.id) ?? bill.name
                }
                total={billTotal(bill.elements)}
                isLast={index === withElements.length - 1}
                canDelete={bills.length > 1}
                onOpen={() => onOpenBill(bill.id)}
                onRename={(name) => renameBill(bill.id, name)}
                onDuplicate={() => duplicateBill(bill.id)}
                onDelete={() => {
                  if (window.confirm(`Delete "${bill.name}" and all its elements?`)) {
                    deleteBill(bill.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Always reachable: outside the scrolling ledger, so an empty list or a
          long one never hides it. */}
      <div className="shrink-0 border-t border-border px-3 py-3">
        <button
          type="button"
          onClick={() => addBill()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg shadow-sm transition-opacity hover:opacity-90 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Add Bill
        </button>
      </div>
    </>
  );
};

// Names live in `bills`; collectBills snapshots may lag a keystroke, so the
// row reads the freshest name straight from the bills list.
function lookupBillName(
  bills: { id: string; name: string }[],
  id: string
): string | undefined {
  return bills.find((b) => b.id === id)?.name;
}

function BillRow({
  label,
  name,
  total,
  isLast,
  canDelete,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  label: string;
  name: string;
  total: number;
  isLast: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      onClick={onOpen}
      className={`group cursor-pointer bg-surface px-3 py-2.5 transition-colors hover:bg-overlay/5 ${
        isLast ? "" : "border-b border-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>

        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Bill options"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-overlay/10 hover:text-body group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-surface py-1 shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDuplicate();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </button>
                <div className="my-1 h-px bg-surface-muted" />
                <button
                  type="button"
                  disabled={!canDelete}
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <input
          value={name}
          onChange={(e) => onRename(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="Untitled Bill"
          className="min-w-0 w-1/2 rounded bg-transparent px-1 -mx-1 text-base font-semibold text-body outline-none transition-colors hover:bg-overlay/10 focus:bg-surface focus:ring-1 focus:ring-accent/30"
        />

        <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-body">
          {CURRENCY} {formatAmount(total)}
        </span>
      </div>
    </div>
  );
}

export default BillsOverview;
