# BOQ import from Excel

Added 2026-09-09. Import sits beside Export in the BOQ panel header
(`TakeoffRightSidebar`), editors only.

## What it does

A spreadsheet becomes bills → elements → items (+ quantity history) in the
open project. The file is read in the browser (`src/utils/boqImport.ts`,
SheetJS loaded on first use so it is not in the main bundle); nothing is
written until the person confirms the preview; the write goes through the
store's `importBills` action, which enqueues the same per-entity sync ops as
any other edit and is one undo step.

Every sheet is a bill named after its tab. A sheet called `Summary` is
skipped, as is any sheet with no item rows.

## Two layouts

**Reckon export** — exactly what `reckon_api/src/helpers/excelHelper.js`
writes: six columns `ITEM / DESCRIPTION / QTY / UNIT / RATE / AMOUNT`, the
column headers restated above each element, an element opened by a text-only
row in column B and closed by its `… TO SUMMARY` subtotal, text-only rows
inside a section as item-group headers. Recognised by the header row.

The QTY cell holds the item's history as a formula — `=(12.5)+(3.2)-(1.1)`,
one term per crumb, deductions negated — so history round-trips. What cannot
come back is a link to plan geometry: the file carries no measurement id, so
the crumbs import as manual entries.

**By column names** — any sheet whose header row names a description column
and a quantity column (unit, rate and amount are optional; a bracketed
suffix such as `Unit Rate (NGN)` is ignored). Rows with a quantity are items.
A text-only row set in CAPITALS opens an element; one in mixed case is an
item-group header inside the current element — the convention on most QS
sheets. Subtotal / total / carried forward lines are skipped. Best effort:
the preview labels these sheets and warns, so the person can check the
grouping.

## Quantities

A card's quantity is `computeQtyFromHistory(history)`, so an imported
quantity is always expressed as history: the export formula's terms, or a
single manual crumb holding the cell's number. Cross-sheet or cell-reference
formulas cannot be recomputed here; the cell's cached value is used.

## Existing bills

Default **Keep and add** appends the new bills after the existing ones (names
de-duplicated with a `(2)` suffix). **Replace all** removes every existing
bill first. A project still holding only the empty seed bill is treated as
empty either way. Both are undoable.

## Units

`normalizeUnit` maps common spellings (`m²`, `sqm` → `m2`; `cum` → `m3`;
`nos`, `no.` → `nrs`; `tons`, `tonne` → `tonns`; `lm` → `m`); anything else is
kept as typed, since units are free text on the platform. An empty unit
becomes `item`.

## Not done

Bold-row detection (SheetJS community build does not read styles), PDF BOQs,
a server-side import endpoint (the row-mapping rules are pure and can be
copied to `POST /boq/import` if mobile needs it), and a Share/Publish screen
for the existing `publish-template` endpoint.
