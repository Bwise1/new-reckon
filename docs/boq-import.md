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

## Update from an edited export

The export writes each element's and item's store id into column G, and each
item's own group header into column H (the visible sheet emits a sub-header
row only for items that have one, so without this an item with no header
would inherit its neighbour's on every round trip). Both columns are declared
hidden and 2 characters wide, but `xlsx-js-style` drops the hidden flag on
write — rewriting the file through plain `xlsx`, which honours it, throws away
all cell styling — so they render as two hairline columns of near-white 6pt
text past Amount.

The export also writes a hidden `_reckon` sheet naming the project, the
export time, and which bill each tab is. A file exported from the open project therefore offers a
third mode, **Update this project** (`mergeImportedBills`, pure, previewed
before applying):

- a row with a known id updates that item in place (description, group,
  unit, rate, quantity);
- a row without one is a new item or element, inserted where it sits;
- items or elements the file no longer lists are removed — a checkbox,
  on by default;
- a renamed tab renames its bill; a tab with no bill id becomes a new bill.

Quantities: if the QTY cell's formula still matches the item's history
(`formulaOfHistory` mirrors the exporter), the existing history is kept
verbatim — ids and measurement links intact. If it was edited, the file's
crumbs replace it and the preview says how many items lost their links.

A file from another project (different `project_id`) can only be added as
new bills; ids are regenerated (`withFreshIds`) so nothing collides.

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
