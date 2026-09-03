# Comments on the takeoff — plan

Figma-style comments for Reckon Bill: pins on the drawing, threads on BOQ
elements and items, @mentions of the people on the project, notifications
that bring them back to the exact spot. Built to make working together on a
bid smooth — the first collaboration feature, shipped ahead of project
sharing and designed so nothing is redone when sharing lands.

Status: **first release built 2026-09-03 — BOQ elements and items only**
(prototype parity: trigger + popover, replies, resolve/reopen, delete own,
offline via the sync queue; reckon_api commit on `Update`, Reckon-app on
`main`). Canvas pins, @mentions, notifications and the comments panel are
**deferred** at the user's request; the data model below is what shipped,
so they land without a migration. Supersedes §3 of
`takeoff-comments-plan.md` (which stays for the takeoff-card parity notes).
Backend goes on reckon_api `Update`; web on Reckon-app `main`. Prototype
reference for the UI: `CommentPopover.tsx` / `CommentTrigger` in
YemiKrist/Reckon-Bill.

---

## 1. What "Figma-style" means here — the eight behaviours

1. **A comment lives somewhere.** Every thread is pinned to a thing: a point
   on a plan page, a measurement, a BOQ element, a BOQ item, or the project
   as a whole. Pins are visible on the canvas; the BOQ shows a small trigger
   with a count.
2. **A pin is a thread.** Root comment plus replies, in order, with author,
   avatar and time. One conversation per pin.
3. **@mention people on the project.** Typing `@` opens a picker of everyone
   who can see the project; a mention renders as a chip and notifies that
   person.
4. **Resolve hides, never deletes.** Resolving removes the pin from the
   canvas (toggle "Show resolved" brings it back) and keeps the thread.
   Anyone in the thread can reopen it.
5. **You are told when it matters.** Mentioned → notified. Someone replies in
   a thread you started or wrote in → notified. A thread you are in is
   resolved → notified. Nothing else.
6. **Unread is per person.** A thread you have not opened since its last
   comment shows a solid dot; the project card shows how many.
7. **Everything deep-links.** A notification opens the project, pans to the
   pin and opens the thread — the link is the comment's address.
8. **It works offline and syncs like everything else.** Comments use the
   same client-uuid + sync-queue path as measurements, so a comment written
   on a train lands when the connection does.

## 2. Anchors

| Anchor | Stored as | Where the pin appears | Follows |
| --- | --- | --- | --- |
| Plan point | `plan_client_uuid`, `page`, `x`, `y` in **image-space pixels** | On the drawing, at that point | The drawing — zoom, pan and page rotation all keep it in place because image space is the source of truth |
| Measurement | `anchor_client_uuid` of the measurement | At the shape's first vertex (linear/arc) or centroid (area/count) | The measurement if it is moved or edited; deleted measurement → the pin re-anchors as a plan point at its last position, so the conversation is never lost |
| BOQ element | `anchor_client_uuid` of the element | Trigger in the element header row (prototype's `CommentTrigger`) | The element |
| BOQ item | `anchor_client_uuid` of the item | Trigger in the item card footer, next to Reset | The item |
| Project | nothing | "Project" section at the top of the comments panel | — |

BOQ elements and items get **one thread each** (the prototype's model: one
trigger, one popover, a count badge). The drawing gets **unlimited pins**.
The data model is the same for both; only the UI differs.

## 3. Who can do what

Resolved from the project role once collaboration ships; until then the
project owner is the only person on the project and can do everything.

| | Viewer | Reviewer | Contributor / Editor | Project Admin |
| --- | --- | --- | --- | --- |
| Read threads | ✓ | ✓ | ✓ | ✓ |
| Comment, reply, mention | — | ✓ | ✓ | ✓ |
| Resolve / reopen | — | own threads + threads they wrote in | same | any |
| Edit / delete a comment | — | own | own | any |
| Move a pin | — | own threads | own | any |
| Delete a thread | — | own | own | any |

Reviewer is the role *made* for this: comment and approve, never edit the
takeoff. Cost-visibility gating applies to what a Contributor can see in the
comment's context (a thread on a priced item still never reveals the rate).

## 4. Mentions

- **Picker scope** = everyone who can see the project: the owner, project
  members, and the org's Owners/Admins (they can enter every project). Before
  collaboration ships that is one person; the picker then shows "Invite
  people to mention them" pointing at the Collaborate modal.
- **Storage**: the body keeps a plain-text token `@[Ade Ojo](u:123)`; the
  row also stores `mentions INT[]` so "threads mentioning me" is one indexed
  query. The client renders the token as a chip; a removed member's chip
  still renders their name (attribution never breaks).
- **Validation**: the API drops any mentioned id that is not on the project
  — a client cannot notify someone who cannot see the thread.
- Later: mention a whole role ("@reviewers"), and mentioning a non-member
  offers to invite them.

## 5. Notifications

Two channels, one rule set:

| Event | In-app (bell) | Email |
| --- | --- | --- |
| You are @mentioned | ✓ | ✓ immediately |
| Reply in a thread you started or wrote in | ✓ | ✓ immediately (v1); digest later |
| A thread you are in is resolved / reopened | ✓ | — |
| Your own actions | — | — |

- In-app uses the existing `notifications` table (`type` =
  `comment_mention` / `comment_reply` / `comment_resolved`, `reference_type`
  = `comment_thread`, `reference_id` = the thread's client uuid) and the
  existing list / mark-read endpoints. New: the bell with an unread count in
  the app header, and the project card's unread-threads badge.
- Email through the existing mailer: subject "Ade mentioned you on Lekki
  Waterfront", the comment text, one button "Open comment" → the deep link.
- Deep link: `/project/:id?thread=<client_uuid>` — the app hydrates, switches
  to the pin's page, pans it into view, opens the popover, marks it read.
- Realtime: while a project is open the client polls
  `GET …/comments?since=<last_sync>` every 20 s and merges; new threads by
  others appear with a subtle pin pulse. Postgres LISTEN/NOTIFY → SSE
  replaces polling later without a client change beyond the transport.
- Per-thread mute and a notification-preferences page come later.

## 6. Canvas and BOQ UX (prototype parity + Figma's essentials)

- **Comment tool** in the toolbar, shortcut **C**. Click anywhere on the
  drawing → a pin drops and the composer opens inline ("Add a comment…",
  Enter to post, Shift+Enter newline, Esc cancels and removes the empty pin).
  Clicking a measurement while the tool is active anchors to it.
- **Pins**: a small avatar bubble (initials) with a count when > 1, drawn at
  constant screen size (never scales with zoom), unread = solid accent ring,
  resolved = hidden unless "Show resolved". Hover shows author + first line.
  Click opens the thread. Own pins drag to move (Project Admin: any).
- **Thread popover**: the prototype's `CommentPopover` ported — header with
  title (anchor description: "Wall W-04", "Page 3", "Item 2.1 Excavation"),
  "Resolve thread" / "Reopen", scrollable replies with avatar initials +
  author + relative time, composer with the accent focus ring. Adds: mention
  autocomplete, edit/delete on own comments (hover menu), "Copy link".
- **BOQ triggers**: element header + item footer, 7×7 icon, count badge,
  resolved = check in a muted ring — as the prototype draws them.
- **Comments panel**: a tab in the right sidebar. Filters All / Unresolved /
  Mentions me / Mine; sort newest first; each row = avatar, author, anchor
  label, first line, time, unread dot; click pans to the pin and opens it.
  Header shows the unresolved count. "Show resolved" toggle lives here and
  drives the canvas too.
- **Project card** (dashboard): unread-threads badge.

## 7. Data model (reckon_api, `Update`)

```sql
CREATE TABLE project_comment_threads (
  id                  INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  client_uuid         UUID NOT NULL UNIQUE,
  project_id          INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  anchor_kind         TEXT NOT NULL CHECK (anchor_kind IN
                        ('plan_point','measurement','boq_element','boq_item','project')),
  anchor_client_uuid  UUID NULL,            -- measurement / element / item
  plan_client_uuid    UUID NULL,            -- plan_point (and re-anchored measurements)
  page                INT  NULL,
  x                   NUMERIC(12,3) NULL,   -- image-space px
  y                   NUMERIC(12,3) NULL,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_by         INT NULL REFERENCES users(id),
  resolved_at         TIMESTAMPTZ NULL,
  created_by          INT NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ NULL
);
CREATE INDEX ON project_comment_threads (project_id, status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX one_thread_per_boq_target ON project_comment_threads
  (project_id, anchor_kind, anchor_client_uuid)
  WHERE anchor_kind IN ('boq_element','boq_item') AND deleted_at IS NULL;

CREATE TABLE project_comments (
  id           INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  client_uuid  UUID NOT NULL UNIQUE,
  thread_id    INT NOT NULL REFERENCES project_comment_threads(id) ON DELETE CASCADE,
  body         TEXT NOT NULL CHECK (char_length(body) <= 4000),
  mentions     INT[] NOT NULL DEFAULT '{}',
  created_by   INT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at    TIMESTAMPTZ NULL,
  deleted_at   TIMESTAMPTZ NULL
);
CREATE INDEX ON project_comments (thread_id, created_at);
CREATE INDEX ON project_comments USING GIN (mentions);

CREATE TABLE project_comment_reads (
  thread_id     INT NOT NULL REFERENCES project_comment_threads(id) ON DELETE CASCADE,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);
```

Authorship is `users.id` — which, since Phase 1, maps to an account through
`users.account_id`, so names and avatars come from the person-profile mirror
and a renamed person renames everywhere. `updated_at` on the thread bumps on
every reply (a trigger), which is what `?since=` polling keys on.

## 8. API (`/v1/projects/:projectId/comments`)

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| GET | `/` | `?since=<iso>` `?status=open\|resolved\|all` | Threads with their comments and the caller's `unread` flag. Hydrated with the other entities; polled with `since` |
| POST | `/threads` | `{client_uuid, anchor…, body, mentions[]}` | Creates thread + first comment atomically; idempotent on `client_uuid` |
| POST | `/threads/:uuid/comments` | `{client_uuid, body, mentions[]}` | Reply |
| PATCH | `/comments/:uuid` | `{body, mentions[]}` | Author only; sets `edited_at` |
| DELETE | `/comments/:uuid` | | Author or Project Admin; soft delete; deleting the root deletes the thread |
| PATCH | `/threads/:uuid` | `{status}` or `{page,x,y}` | Resolve / reopen / move |
| DELETE | `/threads/:uuid` | | Author or Project Admin |
| POST | `/threads/:uuid/read` | | Marks read for the caller |
| GET | `/projects/:id/members` | | The mention picker's list. Owner only until collaboration; the same endpoint later returns members + org admins |

Server rules: mentions filtered to people on the project; every write
checks the caller's role (owner-only until `project_members` exists — one
function, `projectAccess(user, project)`, so collaboration swaps the body
not the callers); notifications rows written in the same transaction as the
comment; mention emails sent after commit (failure logged, never blocks).

## 9. Web client (Reckon-app)

- **Store slice** `comments`: `threads: Record<clientUuid, Thread>`,
  `commentsByThread`, `reads`, `showResolved`, `activeThread`, `lastSyncAt`.
  Hydrated with measurements; `since`-merge on poll.
- **Sync ops** (`syncQueue`): `comment.thread.create`, `comment.create`,
  `comment.update`, `comment.delete`, `comment.thread.update` (resolve /
  move), `comment.thread.delete`, `comment.thread.read`. Same dedup rules:
  delete-after-pending-create cancels; update collapses to latest; the
  in-flight exception already generalises.
- **Canvas**: a `CommentPinsLayer` above measurements; pins positioned from
  image-space via the existing transform; comment tool handled in
  `useCanvasInteractions` like the other tools; measurement anchors resolve
  their point from the store each render so they follow edits.
- **Components**: `CommentPin`, `CommentPopover` (ported), `CommentTrigger`
  (ported), `CommentsPanel` (sidebar tab), `MentionInput` (textarea +
  `@` autocomplete over `/members`), `NotificationBell`.
- **Deep link** handling in `ProjectDetail`: `?thread=` → after hydration,
  set page, pan, open, mark read, then strip the param.

## 10. Phases

| Phase | Work | Where | Size |
| --- | --- | --- | --- |
| **C1** API + data | migration, model, routes, `projectAccess`, mention validation, notifications rows + mention/reply email, `?since`, tests | reckon_api | 2–3 days |
| **C2** Canvas + BOQ + panel | store slice + sync ops + hydration, comment tool + pins layer, popover + triggers (ported), comments panel, mention input, read state, resolved toggle, deep link | Reckon-app | 5–6 days |
| **C3** Notifications | bell + list + unread count, project-card badge, 20 s polling merge, email templates | both | 2 days |
| Later | reactions, screenshots/attachments, `@role` mentions, per-thread mute, LISTEN/NOTIFY → SSE, mobile, comments from share-link guests (needs the person-without-account model), edit history | | |

C1 + C2 are fully useful **solo** today (annotations on your own bids) and
become collaboration the day project sharing ships — no rework, because
authorship, mentions and access all key on the same `users.id` / project
role the sharing work introduces. C3 is best built alongside the
collaboration phase, when there is someone to notify.

**About two weeks** end to end.

## 11. Decisions to confirm

1. **BOQ elements/items: one thread each** (prototype) rather than unlimited
   pins like the drawing. Plan: one each — simpler UI, matches the trigger.
2. **Email on replies immediately** (v1) vs a 5-minute digest. Plan:
   immediate now, digest when volume warrants.
3. **Deleting**: author + Project Admin only (no time limit). Plan: yes.
4. **Resolved threads hidden by default** with a toggle. Plan: yes (Figma).
5. **Deleted measurement with a thread**: re-anchor as a plan point (plan)
   vs delete the thread with it.
6. **Shortcut `C`** for the comment tool — check it does not collide with
   the existing tool keys.
