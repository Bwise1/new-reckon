# Measurement sections (PlanSwift-style)

Written 2026-08-27. Companion to `docs/buildout-plans.md`.

PlanSwift's model: while a takeoff item is recording, you draw a shape, hit
**New Section**, draw another, and **Stop** when done — every section belongs
to the one item, whose quantity is the sum. Right-clicking an item offers
New Section and Deduct.

Reckon can get the same behavior without any server change, because the app
already has both halves of the idea in other places:

- `HistoryItem.groupId` (types/takeoff.ts) — BOQ takeoff entries written in
  one continuous measuring session share a groupId and display as ONE summed
  chip. Sections are exactly this idea, applied to canvas measurements.
- The area right-click context menu (`areaContextMenu` in FloorPlanCanvas)
  already hosts Add deduction / Duplicate / Delete — New Section slots in.

## Data model — no API columns, no migration

Each *section* stays an ordinary `Measurement` row (own geometry, own
client_uuid, renders/drags/syncs exactly as today). Grouping is one new
optional field:

```ts
/** Measurements sharing a sectionGroupId are sections of one logical
 *  measurement: one pill in the panel, quantity = sum of members. */
sectionGroupId?: string;
```

Carried in the sync **metadata blob** beside `name`/`seq`/`arc` — the same
pattern the arc flag used, so older clients and the server need nothing.
Existing measurements have no sectionGroupId and behave exactly as now.

Rules:
- All members of a group share one geometry family (linear/polyline, or
  area). Count is excluded — the count tool already accumulates clicks into
  one measurement per session.
- The pill's name/seq come from the group's first member (the anchor).
  Renaming the pill renames the anchor.
- Group quantity is computed at display time: sum of member quantities
  (areas already net of their deductions). Nothing stored.

## Session behavior (the "Stop" half)

A measuring session already exists implicitly: tool pick-up → tool put-down
(Escape stage 2, Done, or switching to Pan/Select). Make it explicit:

1. `setActiveTool(tool)` for linear/area generates a fresh session id in the
   store (`measureSessionId`).
2. Every shape finished while the session lives gets
   `sectionGroupId = measureSessionId`.
3. Tool put-down clears the session id. Next pick-up = new group.

So the flow IS PlanSwift's: pick up Area, trace three rooms (each finish =
"new section"), press Escape ("stop") → one pill with the summed m².
Reckon's explicit finish (double-click / close at first vertex) plays the
role of PlanSwift's New Section button, so no extra button is needed while
drawing.

A group with a single member renders as a plain chip — identical to today —
so nothing changes visually unless the user actually draws multiple shapes
in one session.

This is ON by default (confirmed with the user 2026-08-27): every session's
shapes merge into one pill, replacing the old one-chip-per-shape default.
There is deliberately NO split/ungroup UI — the pill is presented as a
single measurement, and individual shapes are managed on the canvas.

## Right-click → New Section (adding to an EXISTING measurement)

Generalize `areaContextMenu` to all measurement types (menu items shown by
type):

- **New section** (all types): pick up the measurement's tool with
  `pendingSectionGroup = its sectionGroupId` (assign one first if the
  measurement predates grouping). Shapes finished while it's set join that
  group instead of the session's own id. The hint pill reads
  "Adding sections to Area 3 — Esc to stop".
- **Add deduction** (areas): unchanged — deductions stay per-section, cut
  from the polygon that was right-clicked.
- Duplicate / Delete: unchanged (Duplicate copies the one section, not the
  group).

## History panel pill

In PlanNavigator's measurement list (inside the existing structured tree —
NOT flattened):

The pill IS a single measurement as far as the user can tell. No `×N`
badge, no expandable section rows, no "split" menu — the panel never
exposes a "group" concept. One chip with:

- type icon, name, **summed quantity** — indistinguishable from a
  single-shape measurement's chip;
- rename renames it, eye hides ALL its shapes, ✕ deletes ALL its shapes,
  link links the summed value;
- hovering it highlights every member shape on canvas (existing
  hover-highlight, fired for each member id).

Individual shapes are managed on the CANVAS only: right-click a shape →
Delete removes just that shape and the pill re-sums; deleting the last
shape removes the pill.

## BOQ linking

Linking a pill writes one takeoff entry per member, all sharing a fresh
`HistoryItem.groupId` — the takeoff box then shows them as its usual single
summed chip. The two grouping mechanisms compose; no new UI in the BOQ box.

## Later (not in v1)

- **Deduct sections for linear** (PlanSwift has negative sections): an
  `isDeduct` flag on a member subtracts its length from the pill sum.
  Precedent: `HistoryItem.isDeduct`.
- Faint sibling highlight when one section is selected on canvas.
- Pill-level "select all sections" for group-move.

## Phases

1. **Plumbing** — `sectionGroupId` on Measurement + metadata round-trip in
   entitySyncMapper/entitySync.service; store selector
   `collectSectionGroups(planId, page)`. Small.
2. **Session grouping** — session id on tool pick-up/put-down; stamp on
   finish (all four finish paths: dbl-click, Enter, close-at-first-vertex,
   auto-area wand). Small.
3. **Pill UI** — merge members into one ordinary-looking chip in
   PlanNavigator (summed value; eye/✕/rename/link act on all members).
   Small-medium (the chip row is already componentized).
4. **Context menu** — generalize to all types + New Section targeting +
   per-shape Delete + hint pill state. Medium.
5. Later items above as demand appears.

Gate every push on `npm run build` (tsc -b), not `tsc --noEmit`.
