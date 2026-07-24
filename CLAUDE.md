# CLAUDE.md

Working manual for AI-assisted development in this repository (`shopping-list`). Read this fully at the start of every session.

## Source of truth

`docs/ai-source-of-truth.md` is the authoritative specification (data model, requirements, acceptance criteria, formats, build order). **If anything here or in generated code conflicts with that document, that document wins.** Do not invent behavior it doesn't specify — if something is undefined or ambiguous, ask before assuming.

## Communication

- Talk to the user **in Spanish**. The user is a Spanish speaker.
- Be direct and concise, no filler.
- Work **iteratively and approval-driven**: propose one step, show the diff, wait for approval before continuing. Do NOT batch multiple stages or make sweeping changes unprompted.
- When you make an assumption, state it explicitly inline.
- The user's shell is **Windows PowerShell**. Give commands for PowerShell (not CMD, not bash).

## What this project is

A shared family shopping-list app: real-time sync across devices, PWA (Android + iOS), 100% free at family scale, ad-free, private. See the source of truth for full scope.

## Tech stack (fixed — do not substitute)

- **Frontend:** Angular, configured as a PWA (Angular Service Worker).
- **Backend:** Supabase (Postgres + Auth + Realtime).
- **Auth:** Supabase Auth. Email = login identity; no email verification in MVP.
- **Real-time:** Supabase Realtime (Postgres Changes). Must respect RLS.
- **Security:** Postgres Row Level Security (RLS), integrated with `auth.uid()`.
- **Theming:** CSS variables (design tokens) from the start; light/dark selector in MVP.
- **Layout:** mobile-first (RNF-10). Real usage happens on a phone, often one-handed in a supermarket. Design for a narrow viewport first, then adapt upward. Touch targets must be comfortably tappable, not sized for a mouse cursor. Default to stacking content vertically rather than multi-column layouts.
- **Testing:** Vitest.
- **Package manager:** npm.
- **Hosting:** Cloudflare Pages, with automatic preview deployments enabled for all non-production branches (useful for testing features that require HTTPS, like camera access, before merging to `main`).
- **Availability:** scheduled GitHub Actions ping to avoid Supabase free-tier pause.

## Language conventions

- **Code, identifiers, comments, commit messages, table/column names: English.**
- **UI text shown to users: Spanish.**
- UI text must be externalizable (i18n-ready), but i18n is NOT implemented in the MVP — do not add a translation library yet.

## Non-negotiable rules

1. **100% free.** Never introduce a paid service, tier, or dependency that forces payment.
2. **Privacy at the database level.** Access control is enforced by RLS, never by the frontend alone. Every table holding user data must have RLS policies. Real-time subscriptions must respect them.
3. **Passwords** are handled by Supabase Auth (hashed). Never store or log plaintext passwords.
4. **Real-time is a priority requirement** — optimize for low perceived latency.
5. **Destructive/irreversible actions require explicit user confirmation** (delete list, delete item, sole-owner leave, remove member). Use a consistent confirmation pattern app-wide.
6. **Do not build anything marked out-of-scope / Phase 2 / Phase 3** in the source of truth unless the user explicitly asks. Stay within the current stage.
7. Keep secrets (Supabase keys, tokens) out of the repo. Use environment variables; never commit credentials. Ensure `.gitignore` covers `node_modules/`, environment files, and build output.
8. **Never run `git commit` (or `git push`) yourself, under any circumstances** — not even if the user says "yes", "go ahead", or approves in chat. After making changes, summarize what changed and propose a suggested commit message (in Conventional Commits format), then stop. The user always runs `git add` / `git commit` themselves in their own terminal.

## Commit conventions

Use **Conventional Commits** for every commit message: `type: short description`, in English, imperative mood.

Common types: `feat` (new functionality), `fix` (bug fix), `docs` (documentation only), `chore` (tooling/config/deps), `refactor` (no behavior change), `test` (tests), `style` (formatting only).

Example: `feat: add username uniqueness check on registration`.

## Commands (PowerShell)

- Install dependencies: `npm install`
- Dev server: `npm start`  (alias of `ng serve`)
- Build: `npm run build`  (alias of `ng build`)
- Test: `npm test`  (Vitest)
- Lint: `npm run lint`

Run lint and the test suite before considering any task done.

## Definition of done (per task)

- Code compiles and lints clean.
- Relevant tests pass (add tests for non-trivial logic).
- Behavior matches the acceptance criteria in the source of truth.
- Diff has been shown to the user and approved.
- Any change that adds, removes, or modifies a screen, route, redirect, or navigation link must be checked end-to-end for navigation consistency: verify what happens after every action that changes auth/session state (login, logout, registration) or navigates between screens, from every screen the change touches — not just the happy path of the task itself. Explicitly re-check existing flows that could be affected (e.g. does logout still redirect correctly from this screen? does a guard still send users to the right place?), not only the new behavior being added.
- At the end of every task, explicitly list what you verified yourself (build, lint, tests, browser automation) versus what you could NOT verify and the user must check manually — and say why you couldn't (e.g. requires a second real user account, requires a real mobile device/camera, requires visually judging design quality, requires waiting on a real external event like an email or a payment). Never silently assume something works just because the code looks correct by inspection alone if it was practical to actually test it.

## Build order (follow strictly, one stage at a time)

0. **Foundations** — Angular PWA + Supabase project + connection + Cloudflare Pages deploy working + CSS-variable theming pattern.
1. **Auth & accounts** — registration (all rules), login/logout, RLS configured as tables are created.
2. **Lists** — create (atomic: owner pointer + owner membership), list, rename, delete.
3. **Items** — add, check/uncheck, edit, delete.
4. **Real-time** — Supabase Realtime on lists & items, respecting RLS.
5. **Invitations** — via 1 (invite/accept/reject) and via 2 (code/QR, scan, request, approve/deny), with uniqueness and delete-on-resolve.
6. **Transfer & exit** — leave list, ownership transfer (chosen or by seniority), sole-owner deletion with confirmation.
7. **Polish & testing** — theme selector, destructive-action confirmation, PWA + QR-scan testing on real Android & iOS, anti-pause GitHub Action.

Do not jump ahead. Finish, test, and get approval for a stage before starting the next.

**Exception:** pure backend work (tables/functions/RLS policies) from a future stage may be built ahead of its turn if it emerges naturally while working on the current stage, involves no UI, and introduces no security risk — but this must be called out explicitly in the task summary when it happens, and the corresponding stage's scope in this document updated to reflect what already exists. Example: the Stage 5 invitation RPC functions were built during Stages 1-2 as part of designing the full data model early; this is fine, but should have been flagged and noted here at the time.

## Current stage

> **Stage 6 — Transfer & exit is complete.** Stages 0-5 (Foundations, Auth, Lists, Items, Real-time, Invitations) are done and stable — see git history for their detailed closing notes if needed.
>
> **Stage 6 (Transfer & exit)**, both backend and frontend, is complete and verified end-to-end with two real user accounts:
>
> - `leave_list(p_list_id, p_successor_id default null)` RPC handles all three cases (RF-09, CA-09.1–09.6) in one function: non-owner just deletes their membership; owner with other members transfers ownership (to a chosen successor or, if none given, to the member with the earliest `joined_at`, stable tiebreak by id) then deletes their own membership; sole owner deletes the list outright (cascades via existing FKs). Returns `table (list_deleted boolean, new_owner_id uuid)` — same "make ambiguous outcomes explicit" pattern as `already_pending` in Stage 5, since the frontend needs to know which case happened, not infer it. Has a guard against transferring ownership to oneself (would leave an owner with no membership row, breaking the "owner is always a member" invariant).
> - `remove_member(p_list_id, p_user_id)` RPC (RF-08, postponed since Stage 2 for lack of real members to test with): owner-only, blocks self-removal (points to `leave_list` instead in its error message), `returns void` (no ambiguous outcome to report here).
> - UI: a "Leave this list" button in `/lists/:id`, visible to any member. Non-owner and sole-owner cases go straight to the existing `ConfirmModal` with a case-specific message. Owner-with-other-members case opens a new `ChooseSuccessorDialog` first (reusing `ConfirmModal`'s overlay/focus-trap CSS via `styleUrls`, `role="dialog"` not `alertdialog`, focuses the `<select>` not "Cancel" — it's a neutral choice, not a destructive default) — confirming it opens `ConfirmModal` with a message reflecting the choice, which then calls `leaveList`.
> - New `/lists/:id/members` screen: read-only member roster for everyone, "Expel" button (owner-only, `ConfirmModal`) for `remove_member`. Explicitly re-checks real membership (not just RLS-allowed reads) before rendering, same defensive pattern as `ListInvite`'s owner check — otherwise an invitee with only a pending invite (allowed to read the list's name via `has_pending_invite`) would see an empty roster instead of a clear error.
> - Realtime: extending Stage 4-5's audited approach, three gaps were found and closed, all client-side (the DB side — publications, `REPLICA IDENTITY FULL` on `memberships`/`lists` — was already ready from Stages 4-5's forward-looking work):
>   1. `subscribeToMyMemberships` only listened for `INSERT`; a self-DELETE (leaving) wasn't reflected on another open tab/device showing `/lists` until reload. Widened to listen for both.
>   2. `ListDetailComponent` had no Realtime subscription on `lists` at all (pre-existing gap, made visible by ownership transfer) — a new member seeing an ownership change (e.g. becoming the new owner) wouldn't see "Invite to this list" appear live. Added `subscribeToList` (filtered by list id — a simple column here, unlike the unfiltered `lists` subscription in `/lists`).
>   3. `/lists/:id/members` roster: reused (1) and (2) for "I lost access" / "list changed", and added a dedicated `list_id`-filtered `memberships` subscription for live join/expel updates to the roster itself — added for cohesion with the rest of the app's real-time-everywhere pattern, even though the only gap it closes (staleness during a short visit to this screen) was already handled gracefully by `remove_member`'s own "not a member" error.
>
> Next up: **Stage 7 — Polish & testing** (theme selector, PWA + QR-scan testing on real Android & iOS, anti-pause GitHub Action).
>
> (Update this line as the project progresses so every session knows where we are.)

## Git workflow

Work on a feature branch per stage (e.g. `feature/auth`, `feature/lists`, `feature/invitations`, `feature/transfer-exit`), not directly on `main`. Merge back to `main` when the stage is finished and working. Stage 0 was done directly on `main`, which is fine for initial scaffolding. Small fixes to an already-closed stage (a typo, a doc sync, a one-off bug not tied to a new stage) can go directly on `main` without a dedicated branch — reserve branches for a full stage's worth of work.

### Task-by-task rhythm (always follow this)

1. One task at a time: each request to you should be a single, small, well-scoped piece of work (one service, one component, one function) — never several bundled together.
2. You implement it, then summarize what changed and state any assumptions explicitly.
3. The user reviews (in chat here, or with the help of the other Claude conversation for design questions).
4. The user commits it themselves (see rule 8 above) with a Conventional Commit scoped to that one task.
5. Only after that commit exists does work start on the next task.

Never propose or start a second task while the previous one is still uncommitted. If the user asks for something broad ("build the invitations flow"), break it down into this same one-task-at-a-time sequence rather than doing it all at once. Do not assume prior work is still uncommitted once the user has confirmed a commit — only treat something as pending if they say so explicitly.

## Project structure

- `src/app/core/` — app-wide singleton services and guards: `supabase.service.ts`, `auth.service.ts`, `auth.guard.ts`, `guest.guard.ts`, `list.service.ts` (lists CRUD, membership/ownership transfer via `leaveList`/`removeMember`, member roster via `getListMembers`/`getListMember`, and all their Realtime subscriptions), `item.service.ts`, `invitation.service.ts`, `merge-change.ts` (generic `mergeChange<T extends { id; modified_at }>()` used by `ItemService`/`ListService`/`InvitationService` to apply Realtime INSERT/UPDATE/DELETE events without duplicates or stale overwrites), `realtime-reconnect.ts` (shared `createReconnectHandler`, triggers a full refetch when a channel comes back up after being down).
- `src/app/features/auth/` — `auth-form.css` (shared styles for login/register), plus `register/`, `login/`, `logout-button/`.
- `src/app/features/lists/` — the `/lists` screen: create, view, inline rename, delete (via ConfirmModal), plus a live badge for pending invitations received. This is the real landing screen for a logged-in user.
- `src/app/features/lists/list-detail/` — `/lists/:id`: items screen (add, optimistic check/uncheck with rollback on error, inline text edit, delete via ConfirmModal), a pending-join-requests badge (owner-only) linking to `/lists/:id/invite`, a "Leave this list" flow (any member — non-owner/sole-owner via `ConfirmModal`, owner-with-others via `ChooseSuccessorDialog` then `ConfirmModal`), and a "View members" link to `/lists/:id/members`.
- `src/app/features/lists/list-invite/` — `/lists/:id/invite` (owner-only): invitation code + QR display, regenerate code, invite by username/email, review/approve/deny pending join requests.
- `src/app/features/lists/join-list/` — `/lists/join`: join a list by typing its code or scanning its QR with the camera (`ngx-scanner-qrcode`).
- `src/app/features/lists/list-members/` — `/lists/:id/members`: member roster (read-only for everyone), "Expel" action (owner-only, via `ConfirmModal`, calls `remove_member`), live updates via Realtime.
- `src/app/features/invitations/` — `/invitations`: review and accept/reject invitations received by the current user.
- `src/app/shared/confirm-modal/` — reusable accessible confirmation modal (focus trap, Escape/backdrop dismiss, `alertdialog` role) for destructive actions specifically (its confirm button is styled `btn-danger`). For non-destructive confirmations (e.g. confirming a join request after a QR scan, or choosing a successor before leaving a list), build a lighter/separate component instead — don't force this component's red styling or `alertdialog` semantics onto a neutral action. Its overlay/focus-trap CSS can be reused via `styleUrls` when the visual chrome is genuinely identical (see `ChooseSuccessorDialog`).
- `src/app/app.ts` / `app.html` — root component: just `router-outlet`.
- `src/app/app.routes.ts` — route definitions. `''` redirects to `/lists`.
- `src/environments/` — gitignored except `environment.example.ts`.
- `src/styles.css` — design tokens (theming) + global resets + shared `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-danger` button styles used across features.
- `docs/` — `ai-source-of-truth.md`, `planning.md`.
- `scripts/generate-env.js` — generates `environment.ts` from env vars before start/build. Reads from a local `.env` file via `dotenv` if one exists (local dev); otherwise reads directly from `process.env` (CI/Cloudflare Pages, where there is no `.env` file — only pipeline-injected environment variables).
- `supabase/schema.sql` — versioned copy of the DB schema (tables, functions, triggers, RLS policies, and `GRANT`s), matching what's applied by hand in the Supabase SQL Editor. Not wired to any migration runner — SQL changes must be run manually in the dashboard and then mirrored here.

## Key domain reminders (full detail in the source of truth)

- List **owner is always also a member** (has a Membership row). Ownership is a pointer on the list, not a boolean on membership.
- Exactly one owner per list at all times.
- `MembershipRequest` has **no status field** — the row's existence means "pending"; resolving it deletes the row. Field `origin` is `INVITE` | `REQUEST`.
- At most one pending request per (user, list), regardless of origin (symmetric rule — see source of truth).
- `invitation_code`: 6 chars, uppercase + digits, excluding ambiguous O/I/L/0/1; auto-generated on list creation; lives as a field on the list (not a separate entity).
- `username`: unique, case-insensitive, 3–20 chars, letters/digits/underscore, must start with a letter.
- Deleting a list cascades to its items, memberships, and requests.
- Supabase Auth's "Confirm email" setting must stay OFF in the project dashboard (Authentication → Providers → Email) — the MVP has no email verification flow, and leaving it on locks new users out with an `email_not_confirmed` error.
- Any new table created by hand in the SQL Editor (not via the Table Editor UI) needs explicit `GRANT` statements for the `authenticated` role, matching exactly what its RLS policies allow — `GRANT` and RLS are independent layers in Postgres; without the `GRANT`, requests are rejected before RLS is even evaluated.
- Watch for self-referential RLS policies (a policy on table X whose condition queries table X itself) — this can trigger `42P17` infinite recursion in Postgres. If a policy needs to check membership/relationship data from the same table it protects, use a `security definer` helper function instead (see `is_list_member`, `has_pending_invite` in `supabase/schema.sql`).
- When a Postgres function's return shape can be ambiguous between two outcomes (e.g. "created new" vs "found existing", or "transferred ownership" vs "deleted the list"), make that explicit with a dedicated field (e.g. `already_pending`, `list_deleted`/`new_owner_id`) rather than letting the frontend guess from timestamps or context — see `invite_user_to_list`/`request_to_join_by_code`/`leave_list`.
- `RETURNS TABLE (...)` functions implicitly turn every output column name into a PL/pgSQL variable visible through the whole function body — unqualified references to a column with the same name elsewhere (e.g. `id`, `list_id`) become ambiguous (`42702`). Always qualify with table aliases inside such functions, and avoid naming local `declare`d variables the same as an output column (see `v_new_owner_id` in `leave_list`, to avoid colliding with the output column `new_owner_id`).
- Changing a function's return type requires `DROP FUNCTION` before `CREATE FUNCTION` — plain `CREATE OR REPLACE` fails with `42P13` if the shape changes, even if the name and arguments are identical.
- If RLS is broadened on a table to serve one screen's need (e.g. letting an invitee read a list's name before accepting), audit every OTHER query and Realtime subscription on that same table — a filterless `select *` or an unfiltered Realtime merge that used to be implicitly scoped by the old policy can start leaking rows for the new reason RLS now allows, even though nothing in that other code changed. When adding a new cross-entity flow (e.g. leaving a list, transferring ownership), proactively audit every screen/subscription that could be watching the affected tables while the flow runs, not just the screen where the action itself lives.
- Camera access in the browser requires a secure context (HTTPS or `localhost`) — testing over a local network IP (`http://192.168.x.x:4200`) will not work for camera features; use a Cloudflare Pages preview deployment (HTTPS) for real-device camera testing instead.