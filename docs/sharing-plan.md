# Project sharing — plan (collaboration stage 1)

Invite people to a project by email with a role; they work on it with you.
Built on the personal workspace every account already has, so it needs no
company organizations — those come next and reuse these tables.

Status: **built 2026-09-04 (all three slices).** Invite links are bearer links: whoever opens one signed in joins — forward with care (matches Figma/Google Docs link invites). Attribution (`created_by`), member colours, share links for clients and seats come later. Contract: `reckon-accounts/docs/access-and-billing.md`
§4 (roles) · comments/mentions become multi-person through this.

## Roles (the suite vocabulary, Bill's powers)

| Role | Edits takeoff & BOQ | Sees rates / amounts | Comments | Manages members |
| --- | --- | --- | --- | --- |
| **Owner** (the creator) | ✓ | ✓ | ✓ | ✓ |
| **Project Admin** | ✓ | ✓ | ✓ | ✓ |
| **Editor** | ✓ | ✓ | ✓ | — |
| **Contributor** | ✓ (measures, quantities) | **—** rates hidden and ignored on write | ✓ | — |
| **Reviewer** | — | ✓ | ✓ | — |
| **Viewer** | — | — | — (reads) | — |

## Data (reckon_api)

- `project_members (project_id, user_id, role, added_by, created_at)` — PK (project_id, user_id).
- `project_invites (id uuid, project_id, email citext, role, token_hash, invited_by, expires_at 14 d, claimed_at, claimed_by)` — one open invite per (project, email).
- The owner stays `projects."user"` and is implicitly Project Admin.

## Access, in one place

`projectAccess(userId, projectId)` → `{ project, role, can: { edit, seeCosts, manage, comment } }`.
`projectModel.findById(id, userId)` (the existing gate on every project route) now
matches owner **or member**, so reads widen everywhere at once; a route-level
guard rejects writes from Reviewer/Viewer and strips `rate` from a
Contributor's item writes; `GET /boq` blanks rates for roles that cannot see costs.

## Invites — accept link, plus claim-by-email

`POST /projects/:id/members/invites {email, role}` writes the row and emails
`${APP_URL}/invite/<token>`. Accepting (`POST /invites/:token/accept`, signed
in) creates the membership. Someone without an account signs up first; the
app remembers the pending link and resumes it after login. Suite-token
sign-ins with a verified email also claim any open invite for that address
automatically. Invites expire in 14 days; Admins can resend or cancel.

## Endpoints

`GET /projects` → owned + shared (each with `role`, `owner`, `members[]`) ·
`GET /projects/:id/members` → owner, members, pending invites ·
`POST …/members/invites` · `POST …/invites/:id/resend` · `DELETE …/invites/:id` ·
`PATCH …/members/:userId {role}` · `DELETE …/members/:userId` (Admin; a member may remove themselves) ·
`GET /invites/:token` (public: project title, inviter, role) · `POST /invites/:token/accept`.

## Web (Reckon-app)

- **Collaborate modal** (prototype's `CollaborateModal`): email + role → Invite;
  "People with access": owner, members with a role dropdown and remove,
  pending invites with Resend / Cancel. Opened from the takeoff header's
  Collaborate button and the dashboard card menu ("Share…").
- **Dashboard**: "Shared with Me" tab, collaborator avatars on cards, a role
  badge on shared projects; "My Projects" = owned.
- **`/invite/:token`** page: shows who invited you to what → Accept → opens
  the project; not signed in → sign in / sign up, then resumes.
- **Role gates in the takeoff**: Viewer/Reviewer get a read-only shell
  (tools and BOQ inputs disabled, no sync writes); Contributor/Viewer never
  see rate fields or amounts.

## Slices

1. ✅ **Backend** — reckon_api `ebd7023`.
2. ✅ **Web** — Collaborate modal, dashboard tab/avatars/badge, invite page.
3. ✅ **Role gates** — read-only shell and cost hiding in the takeoff (`useProjectAccessStore`, filled from `GET /boq`'s `access`).

Later: `created_by` attribution on measurements/items, member colours,
share links for clients, seats when orgs land.
