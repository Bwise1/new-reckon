# Major buildout plans

Placeholder features now visible in the UI, and how each becomes real. Written
2026-08-26; companion to `docs/design-system.md` and the org/billing document
already shared with the team (`reckon-accounts/docs/access-and-billing`).

## 1. Collaborate (Users button in the BOQ header — currently "coming soon")

Per-project sharing. The plan, in dependency order:

1. **Identity is already solved** — accounts live in the standalone identity
   service (identity.reckonio.com), so an invite maps to an account id, not a
   per-app user row.
2. **Backend (`Update` branch)**: `project_members` table
   (project_id, account_id, role owner|editor|viewer, invited_by, status
   pending|accepted, timestamps) + invite endpoints
   (create by email, accept, revoke, list) and a mailer for the invite link.
   Every project-scoped route's ownership check widens from `p.user = ?` to
   membership with role gates.
3. **Client**: CollaborateModal from the Users button — member list with roles,
   invite-by-email field, pending invites (the prototype's CollaborateModal is
   the layout reference). Read-only enforcement for viewers comes last; ship
   owner+editor first.
4. **Not in v1**: live cursors/presence. Sync already merges per-entity, so
   two editors won't corrupt data, but last-write-wins on the same item is
   accepted until presence is worth building.

## 2. Organizations

The full design lives in the access-and-billing document (teams, org roles vs
project roles, external collaborators). Sequencing note: build AFTER
collaborate ships, because orgs generalize `project_members`
(an org grants default membership; per-project overrides stay). The org
dashboard is a separate surface, not part of the takeoff shell.

## 3. Subscriptions

Also specified in access-and-billing (per-seat, per-product or bundle).
Prereqs: orgs (seats belong to an org) and the accounts service's
`product_links`. Nothing in the takeoff UI should hardcode entitlements —
gate features behind a single `useEntitlements()` hook when the time comes so
paywalls are one hook, not scattered ifs.

## 4. Arc tool — SHIPPED (2026-08-27)

3-click input (start, end, point on the curve) → circle through three points
→ tessellated to ~8°/segment at draw time (`src/utils/arcGeometry.ts`) →
stored as an ordinary polyline. No data-model, sync, or export changes
were needed, exactly as planned.

## 5. Preview (Play button — wired)

Done: opens the existing BOQ preview flow (server-rendered document, no
export record). Future nicety: inline preview panel instead of a download.

## 6. Settings page growth

The user will list the settings to add. Landing spots already exist:
`src/pages/Settings.tsx` (account + canvas prefs today). Planned sections as
they arrive: measurement units, currency (unhardcode the ₦ in
`BillsOverview.CURRENCY` → a store pref), default VAT/contingency,
theme default, organization management entry point once orgs exist.
