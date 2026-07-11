# AI Source of Truth — Shared Shopping List App

> Authoritative specification for AI-assisted development. This document is the single source of truth. If any generated code conflicts with this document, this document wins. Do not invent behavior not specified here; if something is undefined, ask before assuming.

## Project summary

Shared family shopping-list app. Free, ad-free, real-time sync across devices. PWA (Android + iOS). Zero cost at family scale.

## Language conventions

- **All code, identifiers, comments, commits, table/column names: English.**
- **UI text: Spanish** (end users are a Spanish-speaking family).
- UI text must be externalizable (i18n-ready) but i18n is NOT implemented in the MVP.

## Tech stack (fixed)

- **Frontend:** Angular, configured as a PWA (Angular Service Worker).
- **Backend:** Supabase (Postgres + Auth + Realtime + Storage).
- **Auth:** Supabase Auth. Email = login identity. Email + password. **No email verification in MVP.**
- **Real-time:** Supabase Realtime via Postgres Changes. Subscriptions MUST respect RLS.
- **Data security:** Postgres Row Level Security (RLS), integrated with Supabase Auth (`auth.uid()`).
- **Theming:** CSS variables (design tokens) from the start. Visible light/dark theme selector is in the MVP.
- **QR:** generation + display + manual entry + camera scan, all in MVP.
- **Hosting:** Cloudflare Pages.
- **Availability:** scheduled GitHub Actions ping to prevent Supabase free-tier pause (7-day inactivity).

## Hard constraints (never violate)

1. **100% free** at family scale. No paid tiers, no services that force payment.
2. **Works on Android and iOS** (PWA, installable, no app stores).
3. **Real-time sync** is a priority requirement; optimize for minimal perceived latency.
4. **Privacy enforced at the database level** via RLS — never rely on the frontend alone for access control.
5. **Passwords hashed**, never stored in plaintext (handled by Supabase Auth).
6. Destructive/irreversible actions require explicit confirmation, consistent pattern app-wide.

---

## Data model

All tables use `uuid` primary keys. Timestamps are `timestamptz`.

### User
| Field | Type | Notes |
|-------|------|-------|
| id | uuid PK | |
| email | string, UNIQUE | login identity |
| password_hash | — | managed by Supabase Auth |
| username | string, UNIQUE, case-insensitive | public handle for invitations |
| first_name | string | required |
| last_name | string | required |
| created_at | timestamptz | |

### List
| Field | Type | Notes |
|-------|------|-------|
| id | uuid PK | |
| owner_id | uuid FK → User | ownership pointer |
| name | string | |
| invitation_code | string(6) | field on the list, NOT a separate entity |
| created_at | timestamptz | |

### Membership (User ↔ List, N:M)
| Field | Type | Notes |
|-------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → User | |
| list_id | uuid FK → List | |
| joined_at | timestamptz | used for ownership transfer by seniority |

### MembershipRequest (unified invite + join request)
| Field | Type | Notes |
|-------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → User | the invitee or the requester |
| list_id | uuid FK → List | |
| origin | enum: `INVITE` \| `REQUEST` | who initiated |
| created_at | timestamptz | |

**No `status` field.** The existence of a row means "pending". Resolving a request (accept/reject/approve/deny) deletes the row.

### ListItem
| Field | Type | Notes |
|-------|------|-------|
| id | uuid PK | |
| list_id | uuid FK → List | belongs to exactly one list |
| product_id | uuid FK → Product, NULLABLE | used from Phase 2 only |
| author_id | uuid FK → User, NULLABLE | null if author account deleted |
| text | string | free text; the item name in MVP |
| checked | bool | marked as picked/bought |
| created_at | timestamptz | |
| modified_at | timestamptz | |
| quantity, unit, price | — | Phase 2 only; may exist nullable, unused in MVP |

### Product (catalog — Phase 2; table empty in MVP)
| Field | Type | Notes |
|-------|------|-------|
| id | uuid PK | |
| name | string | |

---

## Invariants (enforce in DB + logic)

- `email` unique; `username` unique and case-insensitive (store lowercased).
- **The list owner is ALWAYS also a member** (has a `Membership` row). Ownership is an additional role over membership, not a replacement.
- Exactly one owner per list at all times.
- Only the owner performs sensitive actions: delete list, remove member, approve/deny requests, regenerate code.
- At most one `Membership` per (user, list).
- **At most one pending `MembershipRequest` per (user, list), regardless of origin.**
- Creating a list MUST atomically set `owner_id` AND create the owner's `Membership`.
- Deleting a list cascades: its `ListItem`, `Membership`, `MembershipRequest` rows (code lives inside the list).

## Formats

### invitation_code
- Exactly 6 characters, no separators.
- Alphabet: uppercase A–Z + digits 0–9, **excluding ambiguous** O, I, L, 0, 1 (31-symbol alphabet).
- Random, non-guessable, regenerable.
- Auto-generated when the list is created.

### username
- Length 3–20.
- Allowed: letters (a–z), digits (0–9), underscore (`_`). No dots, hyphens, spaces, symbols.
- Must start with a letter.
- Unique, case-insensitive.

### password
- Minimum 8 characters. No other complexity requirements in MVP.

---

## Roles & access

- **Two roles per list:** owner and member. Only difference: destructive/management actions.
- **Open registration:** anyone can create an account. Creating an account grants access to no one's data.
- **Lists are private, invitation-only.** A list is visible/editable only by its owner and invited members. No discovery/search of others' lists.
- RLS policies: a user can read/modify a list only if they own it or have a `Membership` in it. Real-time subscriptions respect these policies.

---

## Functional requirements (MVP)

**Accounts:** RF-01 open registration (email, username, password, first_name, last_name); RF-02 login/logout; RF-03 username unique & public identifier.

**Lists:** RF-04 create (creator becomes owner); RF-05 list all lists where owner or member; RF-06 owner edits name; RF-07 owner deletes list; RF-08 owner removes member; RF-09 member leaves list (with ownership-transfer logic).

**Invitations via 1 (direct):** RF-10 owner invites a registered user by username or email (in-app); RF-11 invitee views pending invites, accepts/rejects; RF-12 accepting makes them a member.

**Invitations via 2 (code/QR):** RF-13 owner generates code (and QR); RF-14 owner regenerates code (invalidates previous); RF-15 user enters code or scans QR to create a join request; RF-16 owner strictly approves/denies each request; RF-17 approval makes requester a member; RF-24 user can scan QR with camera to start the join request.

**Items:** RF-18 any member adds an item (free text); RF-19 any member checks/unchecks; RF-20 any member edits item text; RF-21 any member deletes an item.

**Real-time & install:** RF-22 all list/item changes reflect in real time on all members' devices without reload; RF-23 installable as PWA.

---

## Acceptance criteria

### Registration (HU-01)
- CA-01.1 Valid registration (email, username, password, first_name, last_name) → account created, can log in.
- CA-01.2 Email already registered → error, no account.
- CA-01.3 Invalid email format → error, no account.
- CA-01.4 Password < 8 chars → error, no account.
- CA-01.5 Any required field missing → error, no account.
- CA-01.6 Successful registration → password stored hashed.
- CA-01.7 Username already taken → error, no account.
- CA-01.8 Username invalid format (length not 3–20, disallowed chars, or not starting with a letter) → error, no account.

### Leave & ownership transfer (HU-09)
- CA-09.1 Non-owner member leaves → their membership deleted; list and others unaffected.
- CA-09.2 Owner with other members leaves choosing a successor → ownership to chosen; their membership deleted.
- CA-09.3 Owner with other members leaves without choosing → ownership to member with earliest `joined_at` (stable tiebreak by id/created_at).
- CA-09.4 Sole-owner tries to leave → system warns the list will be deleted and requires explicit confirmation.
- CA-09.5 Confirmed → list deleted, cascading items, memberships, requests, code.
- CA-09.6 Cancelled → nothing changes.

### Invitation via 1 (HU-10 / HU-11)
- CA-10.1 Invite registered user by email/username → creates `MembershipRequest` with `origin = INVITE`; invitee sees it pending.
- CA-10.2 Nonexistent email/username → error, no request.
- CA-10.3 User already a member → blocked, informed.
- CA-10.4 Pending request already exists for that (user, list) pair (any origin) → no duplicate; direct to resolve the existing one.
- CA-10.5 Self-invitation → blocked.
- CA-11.1 Accept invite → creates `Membership` (`joined_at` = accept time), deletes request, user sees list.
- CA-11.2 Reject → deletes request, no membership.
- CA-11.3 Multiple pending invites → all visible, resolved separately.
- CA-11.4 Invite for an already-deleted list → disappears silently.

### Invitation via 2 (HU-12 / HU-13 / HU-14)
- CA-12.1 On list creation → it already has a 6-char auto-generated `invitation_code`.
- CA-12.2 Owner can view the code and its QR.
- CA-12.3 Regenerate → new code; old one invalid for NEW requests. Already-created requests remain valid.
- CA-12.4 Non-owner tries to view/regenerate code → blocked.
- CA-13.1 Valid code → creates `MembershipRequest` with `origin = REQUEST`; owner sees it pending.
- CA-13.2 Nonexistent code → invalid-code error.
- CA-13.3 Already a member → informed, no request.
- CA-13.4 Pending request already exists for that (user, list) pair (any origin) → no duplicate; direct to existing.
- CA-13.5 Owner enters own code → blocked (already a member).
- CA-13.6 Scan with camera permission granted → reads code and creates request (same as typed).
- CA-13.7 Camera permission denied or no camera → inform and offer manual code entry.
- CA-13.8 Invalid QR → error, no request.
- CA-14.1 Owner sees pending requests.
- CA-14.2 Approve → creates `Membership` (`joined_at` = approval time), deletes request.
- CA-14.3 Deny → deletes request, no membership.
- CA-14.4 Requester already approved via other path or nonexistent → handled without duplicates/incoherence.

### Symmetric invitation rule (critical)
At most one pending request per (user, list), regardless of origin. If one already exists and the other channel is triggered, do NOT duplicate — direct to resolve the existing one:
- If the existing one is `REQUEST`, the owner resolves it (approve/deny).
- If the existing one is `INVITE`, the invitee resolves it (accept/reject).
Applies in both directions.

---

## Build order (dependency sequence)

0. **Foundations** — Angular PWA + Supabase project + connection + Cloudflare Pages deploy working + CSS-variable theming pattern established.
1. **Auth & accounts** — registration (all rules), login/logout, RLS configured as tables are created.
2. **Lists** — create (atomic code + owner membership), list, rename, delete.
3. **Items** — add, check/uncheck, edit, delete.
4. **Real-time** — Supabase Realtime on lists & items, respecting RLS.
5. **Invitations** — via 1 (invite/accept/reject) and via 2 (code/QR, scan, request, approve/deny), with uniqueness and delete-on-resolve.
6. **Transfer & exit** — leave list, ownership transfer (chosen or by seniority), sole-owner deletion with confirmation.
7. **Polish & testing** — theme selector, destructive-action confirmation pattern, PWA + QR-scan testing on real Android & iOS, anti-pause GitHub Action.

---

## Out of scope (MVP) — do not build unless asked

- Product catalog / suggestions, categories, quantities, units, prices, purchase total (Phase 2).
- Purchase history, push notifications, multiple organized lists, offline mode (Phase 3).
- Backups (Phase 2).
- Account deletion (designed, postponed — see procedure below).
- i18n / multi-language (architecture ready, implementation postponed).
- Supermarket catalog extraction / scraping (future research, subject to legal/technical viability).

### Account deletion procedure (postponed — for reference only)
1. For each list owned WITH other members → transfer ownership (chosen or earliest member).
2. For each list owned as SOLE member → delete the list (cascade).
3. Set `author_id = null` on all their `ListItem`.
4. Delete all their `Membership` rows.
5. Delete all `MembershipRequest` rows where they are `user` (both INVITE and REQUEST).
6. Delete the `User`.
