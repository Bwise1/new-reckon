# Takeoff card parity + comments plan

Written 2026-08-27 after a detailed pass over the Reckon-Bill prototype's
takeoff (ElementCard / TakeoffInput / CommentPopover at commit 26bd419).
Companion to `docs/design-system.md` and `docs/buildout-plans.md`.

## 1. Visual parity — SHIPPED 2026-08-27

Reckon's EstimationCard now mirrors the prototype's ItemBlock:

- Item card: `rounded-lg border-border bg-surface-muted/50 p-3 space-y-2.5`
  (accent ring survives ONLY as the measuring-target state).
- Unit tabs: full-width joined segmented row, text-xs, active `bg-accent
  text-accent-fg`, inactive `bg-surface text-body`.
- Header input + description box: compact `px-2.5 py-1.5 rounded-md
  border-border` with `focus-within:border-accent ring-2 ring-accent/20`;
  the item letter sits INSIDE the description box (w-9 column).
- Takeoff input: compact mono (`font-mono text-sm`), with the floating
  toolbox above on focus: monochrome Add/Deduct segmented (active =
  primary/accent) + `() + * - / √` micro keys on a light surface pill.
  The old black strip with gold/coral buttons is gone.
- History: **no "History:" title** — chips flow inline joined by muted
  operator glyphs. Chips are `rounded-md border-border bg-surface text-xs`;
  measurement-bound chips get a Link2 mark and `bg-overlay/10` (the
  prototype's "Master" chip look); deduct chips read in danger red.
- Qty/Rate: two flex-1 `rounded-md border-border px-2.5 py-1.5` boxes,
  labels muted-left, values right.
- Footer: `Add: Element Item` as quiet text buttons; Reset/Duplicate/Delete
  as h-7 w-7 icon buttons (`hover:bg-surface-muted`, delete
  `hover:bg-danger/10 hover:text-danger`).

## 2. Feature gaps mapped (prototype → Reckon)

| Prototype feature | Status in Reckon | Notes |
|---|---|---|
| Comments on elements AND items | **missing — planned below** | the collaboration surface |
| Per-item persistent takeoff mode (`add`/`deduct`), deduct qty shown −red | partial | ours is per-commit; the chip carries isDeduct but the ITEM has no sticky mode |
| Inline-editable history chip values | missing | our chips are remove-only; prototype edits each entry in place (mobile parity: the store's unlink-on-edit rule already exists) |
| "Master" chip unlink (X = unlink, not delete) | different | our chip X deletes the entry; unlink lives in the plan panel. Consider: bound chips X → unlink, keep value |
| Element-level comment trigger in the header row | missing | part of comments |
| `showCrosshair` project setting | missing | goes on the Settings-page list |
| Element header `px-3.5 py-3` + hover bg + chevron collapse | present (close enough) | |
| Buy-storage / billing modals | out of scope | subscriptions phase |

## 3. Comments — the plan (built FOR collaboration)

Prototype reference: `CommentTarget = element | item`, `CommentTrigger`
(7×7 icon, count badge in `bg-body text-canvas`, resolved = check in a muted
ring), `CommentPopover` (340×420 fixed popover: header with title +
"Resolve Thread"/"Reopen", scrollable thread of avatar-initials + author +
timestamp + `bg-surface-muted` bubbles, composer with accent focus ring).

### Data model (backend, `Update` branch)

```sql
CREATE TABLE project_boq_comments (
  id SERIAL PRIMARY KEY,
  client_uuid UUID UNIQUE NOT NULL,
  project_id INT NOT NULL REFERENCES projects(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('element','item')),
  target_client_uuid UUID NOT NULL,   -- element/item client_uuid
  author_account_id INT NOT NULL,     -- identity-service account
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ              -- soft delete
);
-- Thread resolution is per-target, not per-comment:
CREATE TABLE project_boq_comment_threads (
  project_id INT NOT NULL,
  target_kind TEXT NOT NULL,
  target_client_uuid UUID NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by INT,
  PRIMARY KEY (project_id, target_kind, target_client_uuid)
);
```

Routes (ownership widens to membership when collaborate ships):
- `GET  /projects/:id/comments` → all comments + thread states (one fetch
  at hydration, same as measurements)
- `POST /projects/:id/comments` (client_uuid, target, body)
- `DELETE /projects/:id/comments/:clientUuid` (author or owner only)
- `PUT  /projects/:id/comments/threads/:kind/:targetUuid` (resolve/reopen)

### Client

- Store slice: `comments: Record<targetKey, CommentEntry[]>` +
  `threadResolved: Record<targetKey, boolean>` where
  `targetKey = kind:client_uuid`. Hydrated with the other entities;
  new syncQueue ops `comment.create`, `comment.delete`, `thread.resolve`
  (same offline queue, dedup: delete-after-pending-create cancels, resolve
  collapses to latest — and the in-flight rule already generalizes).
- Port `CommentTrigger` + `CommentPopover` nearly verbatim (they are
  token-clean); popover portals with `data-theme` scope like our other
  portals. Element trigger goes in the element header row; item trigger in
  the card footer next to Reset.
- Author identity: today, the signed-in user (name/initials from
  useProfile). When collaborate ships, `author_account_id` resolves through
  the member list — no schema change needed, which is the point of writing
  account ids from day one.

### Phases

1. **Solo comments** (useful immediately as annotations): table + routes
   on Update; store slice + sync ops; triggers + popover; hydration.
   Everything works for the owner today and is collaboration-shaped.
2. **Collaborate integration**: membership check on routes; author names
   from the member list; unread state = max(created_at) vs a per-user
   `last_seen_at` (new small table) — badge turns solid when someone else
   commented since your last open.
3. **Later**: mention notifications (email via the invite mailer),
   per-comment edit, realtime via polling→SSE.

## 4. Small follow-ups worth doing with phase 1

- Per-item sticky takeoff mode (`takeoffMode` on EstimationCardData,
  carried in the BOQ item body; deduct renders −qty in danger).
- Inline-editable history chips (store already handles unlink-on-edit).
- Bound-chip X = unlink (keep value as a manual entry) instead of delete.
