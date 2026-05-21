import React, { useState } from "react";

interface BoqExportModalProps {
  open: boolean;
  mode: "preview" | "export";
  initialVat: number;
  initialContingency: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (vat: number, contingency: number) => void;
}

const BoqExportModal: React.FC<BoqExportModalProps> = ({
  open,
  mode,
  initialVat,
  initialContingency,
  busy = false,
  onClose,
  onConfirm,
}) => {
  const [vat, setVat] = useState(String(initialVat));
  const [contingency, setContingency] = useState(String(initialContingency));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5">
        <h3 className="text-base font-bold text-[#003566] mb-4">
          {mode === "preview" ? "Preview BOQ" : "Export BOQ"}
        </h3>
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-gray-700">
            Add Contingency
            <input
              type="number"
              min={0}
              value={contingency}
              onChange={(e) => setContingency(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="0.00"
            />
          </label>
          <label className="block text-sm font-semibold text-gray-700">
            VAT percentage
            <input
              type="number"
              min={0}
              value={vat}
              onChange={(e) => setVat(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="0%"
            />
          </label>
        </div>
        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onConfirm(Number.parseFloat(vat) || 0, Number.parseFloat(contingency) || 0)
            }
            className="px-4 py-2 text-sm rounded-lg bg-[#003566] text-white font-semibold disabled:opacity-50"
          >
            {busy ? "Working..." : mode === "preview" ? "Preview" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BoqExportModal;
