# Single-click area detection

Click once inside an enclosed region (a room, a slab) and get its area
automatically, instead of clicking every corner. PlanSwift calls this "Single
Click"; the mechanism is a flood fill.

Status: **design. Not implemented.**

Written against the actual Reckon canvas, not a generic plan. File/line
references are current as of this writing so you can verify each claim.

---

## 1. What it is, in one line

A paint-bucket fill: from your click, spread across the empty interior of a
room until the dark wall lines stop you, then trace the filled region's outline
into a polygon.

## 2. Why it fits Reckon cheaply

The output of detection is a **polygon of points** — and that is exactly what
an area measurement already is:

- `Measurement.points` is `Point[]` (`src/types/takeoff.ts:16`), and
  `TakeoffMode` already includes `'area'` (line 1).
- `calculateArea(points)` (the shoelace formula) already turns a point list
  into an area (`src/utils/measurementUtils.ts:33`), and deductions are already
  handled (`calculateAreaWithDeductions`, line 85).

So **the entire downstream pipeline already exists.** Single-click does not add
a new measurement type, a new calc, or a new sync path. It only adds a new *way
to produce the points* for an ordinary area measurement. Once it emits a
`Point[]`, it is indistinguishable from a hand-drawn area — history, editing,
BOQ binding, export all work unchanged.

That is the single most important design fact: **this is an input method, not a
feature vertical.**

## 3. The coordinate constraint — read before writing any code

The canvas has three coordinate spaces, and mixing them is the classic way to
break measurements:

- **Screen/stage pixels** — where the user clicks; affected by pan
  (`stagePos`) and zoom (`stageScale`).
- **Image pixels** — the plan bitmap's own pixels.
- **Measurement space** — what `points` are stored in, related to image pixels
  by `imageScale`.

`imageScale` is `containerWidth / pdfNaturalWidth` and **must never change** —
`useCanvasMedia.ts:76,97-99` warn that all coordinate conversion multiplies by
it and it must stay width-based regardless of fit mode or zoom. Every stored
measurement depends on that constant.

**Rule for this feature:** flood fill runs in **image-pixel space** (the
bitmap's own resolution), and the resulting polygon is converted to measurement
space with the *same* transform hand-drawn points already use. Never flood-fill
in screen space — pan/zoom would make the same room detect differently.

## 4. The plan bitmap is readable

Detection needs the plan's pixels. They are available: `useCanvasMedia` holds
an `HTMLImageElement` for the plan (`image` / `baseImageRef`,
`useCanvasMedia.ts:24,80`). Draw it once to an offscreen `<canvas>` at natural
size and `getImageData()` gives the raw pixels to fill over.

For **PDF plans**, the same applies — the page is already rasterized to a
bitmap by pdf.js for display, so the pixels exist regardless of source format.

## 5. Algorithm

### 5.1 Core: scanline flood fill

Not naive recursion (it stack-overflows on a large room). Use an explicit stack
with horizontal-run filling:

```
floodFill(imageData, startX, startY):
  target = "is this pixel interior?" test at (startX, startY)
  if start pixel is a wall → abort (user clicked on a line)
  stack = [(startX, startY)]
  visited = Uint8Array(width * height)   // 1 byte/pixel, not a Set
  while stack not empty:
    (x, y) = stack.pop()
    scan left  from x while interior & unvisited → xL
    scan right from x while interior & unvisited → xR
    mark [xL..xR] on row y as visited
    for each pixel in [xL..xR]:
      if row above is interior & unvisited → push
      if row below is interior & unvisited → push
```

"Interior" = the pixel is background, i.e. **lighter than a threshold**. Walls
are dark lines; the fill stops at them. A tolerance slider controls the
threshold.

### 5.2 Boundary → polygon

The filled region is a pixel mask. Turn its outline into vertices:

1. **Trace the boundary** (Moore-neighbour / marching squares) to get an
   ordered pixel loop.
2. **Simplify** with Ramer–Douglas–Peucker — a room boundary is ~thousands of
   boundary pixels; RDP collapses them to the handful of real corners. Epsilon
   ~2-3 px is the knob.
3. **Convert** each vertex from image-pixel space to measurement space with the
   existing transform.
4. Emit as `Measurement.points`, `type: 'area'`.

### 5.3 Performance

A room might be 500k+ pixels. Two rules keep it responsive:

- **Typed arrays, not Sets/objects** for `visited` and the mask.
- **Run it off the main thread** in a Web Worker if a fill ever exceeds ~50ms —
  pass the `ImageData`, get back a `Point[]`. Start on the main thread; move to
  a worker only if profiling says so.

## 6. Where it hooks in

- **A new tool mode.** Add `'single-click'` (or reuse `'area'` with a modifier)
  to `TakeoffMode`. When active, a single stage click runs detection instead of
  adding a polygon vertex.
- **On click:** convert the click to image-pixel coords → flood fill → trace →
  simplify → convert to measurement space → hand the `Point[]` to the *same*
  code path a finished hand-drawn area uses (the store's add-measurement /
  BOQ-commit flow). From there it is an ordinary area.
- **Nothing new downstream.** No sync change, no export change, no BOQ change.

## 7. The hard part — honestly

The demo always works because demos use clean vector plans. Real Nigerian site
PDFs are often photographed or scanned, and that is where flood fill leaks:

- **A gap in a wall** — a doorway with no threshold line, a dimension line
  crossing the boundary, a broken scan line — and the fill escapes into the
  corridor and measures half the floor.
- **Text/furniture inside the room** creates holes (usually fine — they just
  become interior islands) or, if they touch a wall, a leak.
- **Skew and noise** produce jagged boundaries that RDP mostly cleans up.

Mitigations, in order of effort:

1. **Tolerance slider** (cheap, essential) — lets the user tighten the
   "interior" threshold when a fill leaks.
2. **Gap-closing pre-pass** (medium) — a morphological *close* (dilate then
   erode) on a wall mask bridges small gaps before filling. This is what makes
   it usable on messy scans, and it is the real work of the feature.
3. **Bounded fill** (cheap safety net) — if a fill exceeds, say, 60% of the
   whole plan area, it almost certainly leaked; reject it and tell the user to
   adjust tolerance or trace manually, rather than committing a wrong number.
4. **Editable result** — the detected polygon must be editable like any area,
   so a near-miss is a small drag-fix, not a redo. This already works because
   the output is a normal measurement.

**The honest cost split:** the basic flood-fill-to-polygon on a clean plan is a
few days. Making it robust on messy scans — the gap-closing, the tolerance UX,
the leak guards — is the bulk of the effort and the difference between a demo
and a tool your users trust.

## 8. Calibration still matters

Detection produces a polygon in measurement space; converting that to a **real
area** still uses the project's existing calibration (the scale the user sets
before measuring). Single-click changes how the polygon is drawn, not how it is
scaled — so an uncalibrated plan gives an uncalibrated area, exactly as with
manual measuring. No change there.

## 9. Suggested build order

1. Offscreen-canvas pixel access from the existing plan `HTMLImageElement`;
   prove `getImageData` returns sane pixels for both an image plan and a PDF
   page.
2. Scanline flood fill on the main thread, visualized as a highlight overlay
   (no measurement yet) — so you can *see* leaks while tuning.
3. Boundary trace + RDP → `Point[]`; drop it into the existing area path.
4. Tolerance slider + the 60%-leak guard.
5. Gap-closing pre-pass. Ship without it if clean plans are the first target;
   add it before messy-scan users rely on it.
6. Web Worker only if step 2 profiles slow.

## 10. Scope note

This is a genuine feature, not a tweak — plan on the order of a week or two for
something trustworthy on real plans, most of it in §7. It is also isolated:
because it only produces `Point[]` for the existing area pipeline, it can be
built and shipped behind a tool toggle without touching sync, export, or BOQ
code.
