# Plan measurement → BOQ item linking

Reference plan for wiring canvas measurements into estimation-card `history`.
Not yet implemented — coded when we come back to this.

## Problem

Two data flows currently exist in isolation:

- **Canvas takeoff** — `Measurement` records on plans, each with a real-unit `quantity`.
- **BOQ elements** — `EstimationCard` records with `history: HistoryItem[]`; each history entry is a free-text formula (`"10*3*1"`, `"250"`, or a plain number), possibly tagged `isDeduct`. `qty = sum(history)`; `total = qty * rate`.

Nothing feeds a canvas measurement's number into a card's history today. Estimators have to retype values, which defeats on-plan takeoff.

## Chosen model — bind measurements to items, N per item

- Each `Measurement` optionally carries `boqElementId` and `boqItemId`.
- One item can hold many bound measurements. All addition/deduction math happens inside the item's `history`, matching the existing estimator flow.
- Binding is UI-driven — a small "Send to…" affordance on measurement rows lists element/item lines filtered by matching unit (m² measurements → m² items, etc.).

## Sync rules

| Action on plan | Effect on BOQ history |
| --- | --- |
| Create bound measurement | New history entry appears on the bound item, value = measurement quantity, source-tagged. |
| Edit measurement (drag vertex, recompute qty) | Corresponding history entry updates to the new value. |
| Hide measurement (eye-off) | **No effect on BOQ.** Hide is canvas-only visibility. |
| Delete measurement | Corresponding history entry is removed from the item; item qty recalculates. |
| Toggle measurement deduction (Scissors on area) | Corresponding history entry flips `isDeduct`. |
| Unbind measurement | History entry is removed from the item; measurement stays on canvas, unlinked. |

| Action on BOQ (mobile or web) | Effect on plan |
| --- | --- |
| Edit the value of a bound history entry | **Unlinks it.** The entry becomes a plain typed entry (like any manual formula). The canvas measurement loses its outbound binding for that entry. Prevents silent divergence between the plan and the BOQ. |
| Delete a bound history entry | Entry is removed. The canvas measurement stays on the plan but becomes unbound. |
| Move a bound history entry between items | Treated as unlink + rebind. |

Rationale for the unlink-on-edit rule: mobile users can access the BOQ but not the canvas. If they edit a bound value, the plan number and the BOQ number would silently disagree. Unlinking makes the divergence explicit — the entry is now "just a number the user typed," identical to any manual formula, and the source measurement no longer claims to drive it.

## Data-model changes

`src/types/takeoff.ts`

```ts
export interface Measurement {
  // …existing…
  boqElementId?: string;
  boqItemId?: string;
}

export interface HistoryItem {
  // …existing (id, value, isDeduct)…
  /** Client id of the source Measurement, if this entry was pushed from the plan. */
  sourceMeasurementId?: string;
}
```

## Store actions (Zustand)

- `bindMeasurementToItem(measurementId, elementId, itemId)` — sets the ids on the measurement; appends a `HistoryItem` to the item with `sourceMeasurementId` set, `value` = string form of `measurement.quantity`, `isDeduct` = `measurement.quantity < 0` (existing convention). Recomputes item qty.
- `unbindMeasurement(measurementId)` — clears the ids on the measurement; removes any history entry across all items whose `sourceMeasurementId` matches. Recomputes affected item qty.
- On any measurement value change (add/remove vertex, drag, deduction toggle) — walk items, find matching `sourceMeasurementId`, update the entry's `value` and `isDeduct`. Recompute qty.
- On BOQ side, when a user edits a history entry with `sourceMeasurementId`: clear `sourceMeasurementId` on the entry and clear `boqItemId`/`boqElementId` on the referenced measurement. That's the unlink.

## UI touchpoints

- **PlanNavigator History tab** — each measurement row gets a small "→" (link/send) button. Click opens a dropdown showing `Element ▸ Item` picks, filtered by matching unit. Selecting binds. If already bound, the row shows a small chip like `→ Element 1 · Item C` and clicking the chip unbinds.
- **EstimationCard history chips** — bound entries render with a small link icon and tooltip `"From plan · Measurement N (plan Y)"`. Editing removes the icon and unlinks per the rule above.
- **Canvas** — bound measurements show a subtle badge (element letter + item letter, e.g. `1·C`) near the measurement's label, so estimators can see at a glance which item each markup contributes to.

## Sync payload

`plans`, `takeoffItems`, and `boqElements` all already ride the `WebDataSyncPayload`. The new fields (`boqElementId`, `boqItemId`, `sourceMeasurementId`) are plain strings on already-synced records — no new endpoint needed. Mobile can add read/write support at its own pace; unknown fields degrade gracefully.

## Migration

- Existing measurements have no binding — unaffected.
- Existing history entries have no `sourceMeasurementId` — treated as manual formulas.
- No schema migration required.

## Open questions to answer at implementation time

- Should the "Send to…" picker default to the currently-focused card (existing `isActive` state on EstimationCard)? Yes, probably — one click to bind to the active item.
- When a bound area measurement is toggled Scissors-on (deduction) after the fact, should the history entry auto-flip to `isDeduct`? Recommend yes — that's the whole point of the binding.
- Should we surface a warning in the BOQ when a bound entry's plan measurement has been hidden? Recommend no — hide is a canvas-only thing.
- Should we allow one measurement to feed multiple items (e.g., a wall area contributing to both plastering m² and painting m²)? Currently the model is one measurement → one item. If we need many-to-many, `sourceMeasurementId` on the entry side is already correct; we'd just allow multiple entries per measurement id.
