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
- **Testing:** Vitest (added when the first test is written, in Stage 1).
- **Package manager:** npm.
- **Hosting:** Cloudflare Pages.
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
- Test: `npm test`  (Vitest, once configured)
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

> **Stage 4 — Real-time is complete.** Stage 2 (Lists) is complete: ListService (create/list/rename/delete via RLS-backed queries plus the create_list_with_owner RPC), the /lists screen (create, view, inline rename, delete via a reusable ConfirmModal with full focus-trap accessibility), route '' redirects to /lists, /lists/:id placeholder ready for Stage 3, and two RLS/database fixes discovered along the way: recursive RLS policy on memberships (fixed via a security-definer helper function) and missing table GRANTs for the authenticated role (tables were created by hand in the SQL Editor, bypassing the Table Editor's automatic grants). Full navigation flow (login/register/logout/create/rename/delete) verified end-to-end in the browser.
>
> Stage 3 (Items) is complete too: ItemService (add/check-uncheck/edit/delete via direct RLS-backed queries on `list_items`), the /lists/:id screen fully built out (add item, optimistic check/uncheck with rollback on error, inline text edit, delete via ConfirmModal), all verified end-to-end in the browser.
>
> Stage 4 (Real-time) is complete: a shared, pure `mergeChange<T>()` helper (`src/app/core/merge-change.ts`, `id` + `modified_at` based, dedupes/orders INSERT/UPDATE/DELETE) is used by both `ItemService.mergeItemChange` and `ListService.mergeListChange`. `list_items` and `lists` both emit Realtime `postgres_changes` (added to the `supabase_realtime` publication, `REPLICA IDENTITY FULL` on both — required for DELETE events to carry the columns RLS/filters need, discovered while testing `list_items` deletes not propagating). `list_items` subscriptions filter by `list_id`; `lists` subscriptions intentionally use **no filter** and rely on Realtime evaluating the "owner or member" RLS policy per subscriber — verified explicitly with an unrelated third account that never received events for a list it had no access to. A shared `createReconnectHandler` (`src/app/core/realtime-reconnect.ts`) detects a channel coming back to `SUBSCRIBED` after having been down and triggers a full refetch (not a merge) in both `ListDetail` and `Lists`, verified with a real simulated network drop (`browserContext.setOffline`). RNF-06 (perceived-as-immediate sync) was measured, not assumed: see the verification note under "Hard constraints" #3 in `docs/ai-source-of-truth.md` (sub-second, ~660 ms average across 12 real cross-tab measurements).
>
> **Ahead-of-schedule database work (see Build order exception below):** `supabase/schema.sql` already includes the Stage 5 invitation RPC functions — `invite_user_to_list`, `request_to_join_by_code`, `accept_invitation`, `reject_invitation`, `approve_join_request`, `deny_join_request` — built and correct at the database level (RLS + `security definer`, symmetric one-pending-request rule enforced via a unique constraint). **None of this is wired into the frontend yet** — no services, no components, no routes reference these functions. Stage 5 still needs its full UI (invite by username/email, accept/reject, code/QR generation and scanning, approve/deny) built from scratch; only its backend groundwork exists.
>
> Next up: **Stage 5 — Invitations** (UI only; backend already exists as noted above).
>
> (Update this line as the project progresses so every session knows where we are.)

## Git workflow

Starting from Stage 1, work on a feature branch per stage (e.g. `feature/auth`, `feature/lists`), not directly on `main`. Merge back to `main` when the stage is finished and working. Stage 0 was done directly on `main`, which is fine for initial scaffolding.

### Task-by-task rhythm (always follow this)

1. One task at a time: each request to you should be a single, small, well-scoped piece of work (one service, one component, one function) — never several bundled together.
2. You implement it, then summarize what changed and state any assumptions explicitly.
3. The user reviews (in chat here, or with the help of the other Claude conversation for design questions).
4. The user commits it themselves (see rule 8 above) with a Conventional Commit scoped to that one task.
5. Only after that commit exists does work start on the next task.

Never propose or start a second task while the previous one is still uncommitted. If the user asks for something broad ("build the invitations flow"), break it down into this same one-task-at-a-time sequence rather than doing it all at once.

## Project structure

- `src/app/core/` — app-wide singleton services and guards: `supabase.service.ts`, `auth.service.ts`, `auth.guard.ts`, `guest.guard.ts`, `list.service.ts`.
- `src/app/features/auth/` — `auth-form.css` (shared styles for login/register), plus `register/`, `login/`, `logout-button/`.
- `src/app/features/lists/` — the `/lists` screen: create, view, inline rename, delete (via ConfirmModal). No longer a temporary screen — this is the real landing screen for a logged-in user.
- `src/app/features/lists/list-detail/` — placeholder for `/lists/:id`, to be built out in Stage 3.
- `src/app/shared/confirm-modal/` — reusable accessible confirmation modal (focus trap, Escape/backdrop dismiss, `alertdialog` role) for any destructive action across the app. Use this instead of building a new confirmation pattern per feature.
- `src/app/app.ts` / `app.html` — root component: just `router-outlet`.
- `src/app/app.routes.ts` — route definitions. `''` redirects to `/lists`.
- `src/environments/` — gitignored except `environment.example.ts`.
- `src/styles.css` — design tokens (theming) + global resets + shared `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-danger` button styles used across features.
- `docs/` — `ai-source-of-truth.md`, `planning.md`.
- `scripts/generate-env.js` — generates `environment.ts` from env vars, run before start/build.
- `supabase/schema.sql` — versioned copy of the DB schema (tables, functions, triggers, RLS policies, and `GRANT`s), matching what's applied by hand in the Supabase SQL Editor.

## Key domain reminders (full detail in the source of truth)

- List **owner is always also a member** (has a Membership row). Ownership is a pointer on the list, not a boolean on membership.
- Exactly one owner per list at all times.
- `MembershipRequest` has **no status field** — the row's existence means "pending"; resolving it deletes the row. Field `origin` is `INVITE` | `REQUEST`.
- At most one pending request per (user, list), regardless of origin (symmetric rule — see source of truth).
- `invitation_code`: 6 chars, uppercase + digits, excluding ambiguous O/I/L/0/1; auto-generated on list creation; lives as a field on the list.
- `username`: unique, case-insensitive, 3–20 chars, letters/digits/underscore, must start with a letter.
- Deleting a list cascades to its items, memberships, and requests.
- Supabase Auth's "Confirm email" setting must stay OFF in the project dashboard (Authentication → Providers → Email) — the MVP has no email verification flow, and leaving it on locks new users out with an `email_not_confirmed` error.
- Any new table created by hand in the SQL Editor (not via the Table Editor UI) needs explicit `GRANT` statements for the `authenticated` role, matching exactly what its RLS policies allow — `GRANT` and RLS are independent layers in Postgres; without the `GRANT`, requests are rejected before RLS is even evaluated.
- Watch for self-referential RLS policies (a policy on table X whose condition queries table X itself) — this can trigger `42P17` infinite recursion in Postgres. If a policy needs to check membership/relationship data from the same table it protects, use a `security definer` helper function instead (see `is_list_member` in `supabase/schema.sql`).