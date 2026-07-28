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
- **Theming:** CSS variables (design tokens); light/dark selector shipped in Stage 7.
- **Layout:** mobile-first (RNF-10). Real usage happens on a phone, often one-handed in a supermarket. Design for a narrow viewport first, then adapt upward. Touch targets must be comfortably tappable, not sized for a mouse cursor. Default to stacking content vertically rather than multi-column layouts.
- **Testing:** Vitest.
- **Package manager:** npm.
- **Hosting:** Cloudflare Pages, with automatic preview deployments enabled for all non-production branches (useful for testing features that require HTTPS, like camera access, before merging to `main`).
- **Availability:** scheduled GitHub Actions ping to avoid Supabase free-tier pause (`.github/workflows/keep-supabase-awake.yml`).

## Language conventions

- **Code, identifiers, comments, commit messages, table/column names: English.**
- **UI text shown to users: Spanish.**
- UI text must be externalizable (i18n-ready), but i18n is NOT implemented in the MVP — do not add a translation library yet. **Note:** this principle is only partially honored today — see "Known gaps and deferred decisions" below.

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
- If a task reveals a gap, bug, or inconsistency outside its own scope, do NOT fix it silently and do NOT expand the task to cover it — flag it explicitly to the user and let them decide whether it becomes a separate task now or a noted entry in "Known gaps and deferred decisions" below.

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

> **Stage 7 — Polish & testing is nearly complete.** Stages 0-6 (Foundations, Auth, Lists, Items, Real-time, Invitations, Transfer & exit) are done and stable, including a full whole-project audit performed after closing Stage 6 — see git history for detailed per-stage notes. That audit's findings are tracked in "Known gaps and deferred decisions" below; two were fixed immediately at the time (a leave-list TOCTOU bug, a missing wildcard route).
>
> **Stage 7 work completed so far:**
>
> - Fixed the audit's `ConfirmModal`-for-non-destructive-action finding: new `ConfirmDialog` component (`src/app/shared/confirm-dialog/`), a neutral (`role="dialog"`, `btn-primary`) counterpart to `ConfirmModal`. `list-invite.ts`/`.html` now use it for "Regenerar código" instead of `ConfirmModal`.
> - Light/dark theme selector (RNF-17, HU-21): an inline anti-FOUC script in `index.html` reads `localStorage['theme']` (falling back to `prefers-color-scheme`) and sets `data-theme="dark"` on `<html>` before Angular bootstraps; `ThemeService` exposes the current theme as a signal (read from that same attribute) with a `toggle()` that flips it and persists to `localStorage`; a sun/moon toggle next to logout in `ListsComponent` calls it. Also disabled `angular.json`'s production `inlineCritical` CSS optimization, which was deferring the dark-theme tokens to an async stylesheet swap and would have reintroduced the exact flash the inline script was meant to prevent (see "Key domain reminders").
> - Full unit test coverage added for `join-list.ts` (the QR-scan camera state machine, previously the most complex untested logic in the project) and complementary coverage for `list-detail.ts`'s leave-list state machine beyond the existing TOCTOU tests. jsdom has no real camera/`getUserMedia`/wasm decoder, so `join-list.spec.ts` stands in `NgxScannerQrcodeComponent` via `TestBed.overrideComponent` with a minimal fake exposing only what the component actually calls — the real viewChild+effect wiring runs unmodified against that fake.
> - Added `.github/workflows/keep-supabase-awake.yml` (the "Availability" anti-pause action): scheduled Mondays and Thursdays plus manually-dispatchable, calls `get_list_name_by_code` with the anon key and a code the invitation-code alphabet can never generate (`"000000"`), forcing a real unauthenticated read against Postgres with no risk of leaking a real list's name. Fails loudly (non-2xx) if the ping doesn't succeed. **Verified working end-to-end** (manually dispatched, run completed green, response body confirmed as `null`).
> - **Real-device testing (Android + iOS) surfaced three issues, all now fixed and confirmed on-device:**
>   1. A genuine Supabase Realtime platform limitation (not an app bug — see "Key domain reminders"): a `memberships` DELETE payload can never carry `list_id`/`user_id`, only its own primary key, and can never be server-side filtered. This meant a list didn't disappear live from `/lists` for a user who got expelled (`remove_member`) or who left it themselves (`leave_list`) from a second device — it stuck around until reload. Fixed by treating any `memberships` DELETE as a full-resync signal (reusing the existing reconnect refetch) in `subscribeToMyMemberships`/`subscribeToListMembers` (`list.service.ts`) and their callers in `lists.ts`/`list-members.ts`, instead of trying to remove a specific row by a column the payload never contains. **Confirmed fixed on real devices for both the expulsion and self-leave scenarios.**
>   2. On iPad, the QR scanner opened the front (wide-angle) camera by default despite a rear camera being available — WebKit exposes no reliable back/rear/environment keyword in `device.label` (confirmed against public W3C/WebKit sources, not guessed). `startScanning()` now requests the camera via `getUserMedia({ video: { facingMode: { ideal: 'environment' } } })` and trusts the physical camera it actually resolves to (via `track.getSettings().deviceId`) over the label-regex heuristic, which remains as a fallback — no behavior change on already-working Android/iPhone. The existing manual camera-switch dropdown remains the deliberate recovery path for any device/iOS version where even this doesn't resolve correctly. **Confirmed working on real iPad.**
>   3. The always-black QR video box showed empty with a bare status line while the camera was starting, reading as a half-broken layout on real devices. Added a `.qr-loading-overlay` (spinner + "Preparando la cámara…") for that state only, respecting `prefers-reduced-motion`. **Confirmed on real devices.**
>   4. A button with a magnifying glass reading "Preguntar" occasionally appeared over the app on iOS — confirmed to be iOS's own Visual Look Up / Siri feature, not something the app renders or controls. No action taken; not a bug.
>
> **Next up:** a final pass through the full real-device test checklist (PWA install on both platforms, theme, auth/list flows, QR scan including the two fixes above, cross-device real-time, offline/flaky-connection behavior) to confirm everything holds together, then close Stage 7 and the whole MVP: merge to `main`, deploy, and do a final `CLAUDE.md`/source-of-truth consistency pass.
>
> (Update this line as the project progresses so every session knows where we are.)

## Git workflow

Work on a feature branch per stage (e.g. `feature/auth`, `feature/lists`, `feature/invitations`, `feature/transfer-exit`, `feature/polish-testing`), not directly on `main`. Merge back to `main` when the stage is finished and working. Stage 0 was done directly on `main`, which is fine for initial scaffolding. Small fixes to an already-closed stage (a typo, a doc sync, a one-off bug not tied to a new stage) can go directly on `main` without a dedicated branch — reserve branches for a full stage's worth of work. Exception: a piece of a stage that genuinely cannot be verified without living on the default branch (e.g. a `schedule`-triggered GitHub Actions workflow, which GitHub only picks up from the repo's default branch) may be merged early — see Stage 7's `keep-supabase-awake.yml`.

### Task-by-task rhythm (always follow this)

1. One task at a time: each request to you should be a single, small, well-scoped piece of work (one service, one component, one function) — never several bundled together.
2. You implement it, then summarize what changed and state any assumptions explicitly.
3. The user reviews (in chat here, or with the help of the other Claude conversation for design questions).
4. The user commits it themselves (see rule 8 above) with a Conventional Commit scoped to that one task.
5. Only after that commit exists does work start on the next task.

Never propose or start a second task while the previous one is still uncommitted. If the user asks for something broad ("build the invitations flow"), break it down into this same one-task-at-a-time sequence rather than doing it all at once. Do not assume prior work is still uncommitted once the user has confirmed a commit — only treat something as pending if they say so explicitly.

## Project structure

- `src/app/core/` — app-wide singleton services, guards, and framework-agnostic helpers: `supabase.service.ts`, `auth.service.ts`, `auth.guard.ts`, `guest.guard.ts`, `list.service.ts` (lists CRUD, membership/ownership transfer via `leaveList`/`removeMember`, member roster via `getListMembers`/`getListMember`, and all their Realtime subscriptions), `item.service.ts`, `invitation.service.ts`, `merge-change.ts` (generic `mergeChange<T extends { id; modified_at }>()` used by `ItemService`/`ListService`/`InvitationService` to apply Realtime INSERT/UPDATE/DELETE events without duplicates or stale overwrites), `realtime-reconnect.ts` (shared `createReconnectHandler`, triggers a full refetch when a channel comes back up after being down), `id-keyed-action-state.ts` (shared per-id "is this action running / what's its error" tracker, used by `list-invite.ts`, `invitations.ts`, `list-members.ts`), `theme.service.ts` (light/dark theme as a signal, read from `<html data-theme>` — see the anti-FOUC inline script in `index.html`, which is the one place that decides saved-preference-vs-OS-preference; `toggle()` flips the attribute and persists to `localStorage['theme']`).
- `src/app/shared/confirm-modal/` — reusable accessible confirmation modal for **destructive** actions only (its confirm button is styled `btn-danger`, `role="alertdialog"`). Used for delete list/item, remove member, leave list, etc.
- `src/app/shared/confirm-dialog/` — neutral counterpart to `ConfirmModal` for **non-destructive** confirmations (same title/message/confirm/cancel/errorMessage/busy API, but `role="dialog"` and `btn-primary` instead of `btn-danger`). Use this for any confirmation that doesn't destroy or irreversibly affect data — e.g. regenerating an invitation code. Reuses `confirm-modal.css` for the shared modal box styles.
- `src/app/shared/choose-successor-dialog/` — purpose-built (not generic) neutral dialog for the one case where the user picks from a list of options (choosing a successor before leaving a list as owner) rather than a plain yes/no. If a future confirmation needs a plain yes/no, use `ConfirmDialog`; if it needs the user to pick among options, follow this component's pattern instead of forcing it into `ConfirmDialog`.
- `src/app/shared/focus-trap/` — `appFocusTrap` directive: shared focus-trap/Escape/backdrop-dismiss logic, applied as an attribute on an overlay element (`[appFocusTrapDisabled]` to disable while busy, `(appFocusTrapDismissed)` output). Used by `ConfirmModal`, `ConfirmDialog`, and `ChooseSuccessorDialog`; apply it to any future modal-like component instead of re-implementing this logic.
- `src/app/features/auth/` — `auth-form.css` (shared styles for login/register), plus `register/`, `login/`, `logout-button/`.
- `src/app/features/lists/` — the `/lists` screen: create, view, inline rename, delete (via ConfirmModal), a live badge for pending invitations received, and the light/dark theme toggle (next to logout, via `ThemeService`). This is the real landing screen for a logged-in user.
- `src/app/features/lists/list-detail/` — `/lists/:id`: items screen (add, optimistic check/uncheck with rollback on error, inline text edit, delete via ConfirmModal), a pending-join-requests badge (owner-only) linking to `/lists/:id/invite`, a "Leave this list" flow (any member — non-owner/sole-owner via `ConfirmModal`, owner-with-others via `ChooseSuccessorDialog` then `ConfirmModal`, with TOCTOU-outcome-mismatch handling), and a "View members" link to `/lists/:id/members`.
- `src/app/features/lists/list-invite/` — `/lists/:id/invite` (owner-only): invitation code + QR display, regenerate code (via `ConfirmDialog`), invite by username/email, review/approve/deny pending join requests.
- `src/app/features/lists/join-list/` — `/lists/join`: join a list by typing its code or scanning its QR with the camera (`ngx-scanner-qrcode`).
- `src/app/features/lists/list-members/` — `/lists/:id/members`: member roster (read-only for everyone), "Expel" action (owner-only, via `ConfirmModal`, calls `remove_member`), live updates via Realtime.
- `src/app/features/invitations/` — `/invitations`: review and accept/reject invitations received by the current user.
- `src/app/app.ts` / `app.html` — root component: just `router-outlet`.
- `src/app/app.routes.ts` — route definitions. `''` redirects to `/lists`. Wildcard (`**`) also redirects to `/lists`, as the last entry.
- `src/environments/` — gitignored except `environment.example.ts`.
- `src/styles.css` — design tokens (theming) + global resets + shared `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-danger` button styles used across features.
- `docs/` — `ai-source-of-truth.md`, `planning.md`.
- `scripts/generate-env.js` — generates `environment.ts` from env vars before start/build. Reads from a local `.env` file via `dotenv` if one exists (local dev); otherwise reads directly from `process.env` (CI/Cloudflare Pages, where there is no `.env` file — only pipeline-injected environment variables).
- `.github/workflows/keep-supabase-awake.yml` — scheduled (Mon/Thu) + manually-dispatchable ping to keep the Supabase free-tier project from being auto-paused for inactivity. Uses the anon key only; needs the `SUPABASE_URL`/`SUPABASE_KEY` repo secrets (same names/values as the Cloudflare Pages build env — see `scripts/generate-env.js`).
- `supabase/schema.sql` — versioned copy of the DB schema (tables, functions, triggers, RLS policies, and `GRANT`s), matching what's applied by hand in the Supabase SQL Editor. Not wired to any migration runner — SQL changes must be run manually in the dashboard and then mirrored here.

## Key domain reminders (full detail in the source of truth)

- List **owner is always also a member** (has a Membership row). Ownership is a pointer on the list, not a boolean on membership.
- Exactly one owner per list at all times.
- `MembershipRequest` has **no status field** — the row's existence means "pending"; resolving it deletes the row. Field `origin` is `INVITE` | `REQUEST`.
- At most one pending request per (user, list), regardless of origin (symmetric rule — see source of truth).
- `invitation_code`: 6 chars, uppercase + digits, excluding ambiguous O/I/L/0/1; auto-generated on list creation; lives as a field on the list (not a separate entity).
- `username`: unique, case-insensitive, 3–20 chars, letters/digits/underscore, must start with a letter.
- Deleting a list cascades to its items, memberships, and requests.
- Supabase Auth's "Confirm email" setting must stay OFF in the project dashboard (Authentication → Providers → Email) — the MVP has no email verification flow, and leaving it on locks new users out with an `email_not_confirmed` error. Its minimum password length should be set to 8 to match `CA-01.4` — verify this in the dashboard; it cannot be confirmed by reading code.
- Any new table created by hand in the SQL Editor (not via the Table Editor UI) needs explicit `GRANT` statements for the `authenticated` role, matching exactly what its RLS policies allow — `GRANT` and RLS are independent layers in Postgres; without the `GRANT`, requests are rejected before RLS is even evaluated.
- Watch for self-referential RLS policies (a policy on table X whose condition queries table X itself) — this can trigger `42P17` infinite recursion in Postgres. If a policy needs to check membership/relationship data from the same table it protects, use a `security definer` helper function instead (see `is_list_member`, `has_pending_invite` in `supabase/schema.sql`).
- When a Postgres function's return shape can be ambiguous between two outcomes (e.g. "created new" vs "found existing", or "transferred ownership" vs "deleted the list"), make that explicit with a dedicated field (e.g. `already_pending`, `list_deleted`/`new_owner_id`) rather than letting the frontend guess from timestamps or context — see `invite_user_to_list`/`request_to_join_by_code`/`leave_list`. **And when the function already returns that field, the frontend must actually read and act on it** — a TOCTOU bug in Stage 6 shipped this exact field but ignored it at the call site; see git history for the fix.
- `RETURNS TABLE (...)` functions implicitly turn every output column name into a PL/pgSQL variable visible through the whole function body — unqualified references to a column with the same name elsewhere (e.g. `id`, `list_id`) become ambiguous (`42702`). Always qualify with table aliases inside such functions, and avoid naming local `declare`d variables the same as an output column (see `v_new_owner_id` in `leave_list`, to avoid colliding with the output column `new_owner_id`).
- Changing a function's return type requires `DROP FUNCTION` before `CREATE FUNCTION` — plain `CREATE OR REPLACE` fails with `42P13` if the shape changes, even if the name and arguments are identical.
- If RLS is broadened on a table to serve one screen's need (e.g. letting an invitee read a list's name before accepting), audit every OTHER query and Realtime subscription on that same table — a filterless `select *` or an unfiltered Realtime merge that used to be implicitly scoped by the old policy can start leaking rows for the new reason RLS now allows, even though nothing in that other code changed. When adding a new cross-entity flow (e.g. leaving a list, transferring ownership), proactively audit every screen/subscription that could be watching the affected tables while the flow runs, not just the screen where the action itself lives.
- Camera access in the browser requires a secure context (HTTPS or `localhost`) — testing over a local network IP (`http://192.168.x.x:4200`) will not work for camera features; use a Cloudflare Pages preview deployment (HTTPS) for real-device camera testing instead.
- **A `postgres_changes` DELETE payload can never be trusted to carry more than the table's own primary key, and can never be filtered server-side.** Two independent, permanent platform limitations of Supabase Realtime (confirmed against the official docs, not a bug on our end): (1) "RLS policies are not applied to DELETE statements... when RLS is enabled and replica identity is set to full on a table, the old record contains only the primary key(s)" — so any other column (a foreign key like `list_id`/`user_id`, a status flag, anything) is stripped from `payload.old` on DELETE, regardless of `replica identity full`; (2) "Delete events are not filterable" — a channel's `filter: column=eq.value` is silently ignored for DELETE events, which arrive for every row change on the whole table. This is harmless for tables where the local state is already keyed by that same primary key (`lists`, `list_items`, `membership_requests` — see `mergeChange` in `merge-change.ts`, which only ever needs `.id` for its DELETE branch), but breaks any subscription that needs a *different* column from the deleted row — exactly the case for `memberships`, whose synthetic `id` PK is never what the frontend keys state by (`list_id` for "my lists", `user_id` for a list's roster). Never design a new subscription assuming a DELETE payload carries anything beyond its own primary key, or that a filter narrows which DELETEs arrive — resync via a full refetch instead (see `subscribeToMyMemberships`/`subscribeToListMembers` in `list.service.ts`, and their callers in `lists.ts`/`list-members.ts`).
- On iOS/WebKit, `MediaDeviceInfo.label` has no reliable, documented keyword identifying a camera as front- or back-facing — don't extend the existing `/back|rear|environment/i` regex with a guessed iPad-specific string. Instead, request the camera via `getUserMedia({ video: { facingMode: { ideal: 'environment' } } })` and read back which physical device actually got resolved via `track.getSettings().deviceId`, trusting that over any label heuristic (fall back to the label regex only if `facingMode` resolution is unavailable). Even this isn't 100% guaranteed on every iOS version/device (cited WebKit regressions exist) — always keep a manual camera-switch control as the user-facing recovery path for any camera-selection heuristic, on any platform.
- Angular's production build inlines "critical" CSS into a `<style>` block in `index.html` and defers the full stylesheet via a `media="print"` swap trick (Beasties). Left on, this only inlines the `:root` (light) tokens — the `[data-theme="dark"]` override lives in the deferred stylesheet — so a returning user with dark mode saved would still flash light on first paint even with the anti-FOUC inline script correctly setting `data-theme="dark"` before Angular loads. `angular.json`'s production config sets `optimization.styles.inlineCritical: false` to keep the full stylesheet (both themes) as one normal blocking `<link>`, which is what actually makes the anti-FOUC script effective. Only affects production builds — `ng serve` never did this inlining, so the difference is invisible in local dev.

## Known gaps and deferred decisions

A full whole-project audit was performed after closing Stage 6; most of its findings were resolved during Stage 7 (see "Current stage" and git history). What remains below is what's still deliberately deferred — kept here so it isn't rediscovered from scratch later.

**Consciously accepted (decisions, not bugs):**

- The `profiles` SELECT policy uses `using (true)` — any authenticated user can read any user's `username`/`first_name`/`last_name`. This is broader than any single screen strictly needs (only co-members and requesters actually need to see each other's profiles), but a tighter policy scoped to "shared list or pending request" would be non-trivial to write without risking the same kind of self-referential-policy recursion (`42P17`) already solved elsewhere with `security definer` helpers. At family scale, `using (true)` is an accepted tradeoff — a conscious decision, not a default left unexamined.
- i18n readiness (RNF-18) is only partially honored in practice. Most user-facing text lives in templates as intended, but a non-trivial amount of Spanish text is embedded directly in `.ts` files: all the `toReadable*Error` translation functions (register, login, list-detail, list-invite, join-list, list-members), several user-facing messages built in component logic (`leaveConfirmMessage`, success/warning messages in `join-list`/`list-invite`), and some `aria-label`s built by string concatenation. None of this blocks the MVP (i18n itself is out of scope), but it means a future migration to a real i18n library (e.g. Transloco) will require refactoring these call sites, not just wiring up a library. Accepted as a known cost of the "prepared but not implemented" approach, not something to fix preemptively.

**IMPORTANT (not blocking; candidates for a future maintenance pass):**

- `RPC` functions have inconsistent `GRANT EXECUTE` handling: `leave_list` and `remove_member` have it explicit (`to authenticated`); every other RPC (`create_list_with_owner`, `invite_user_to_list`, `request_to_join_by_code`, `accept/reject/approve/deny_*`, `get_list_name_by_code`, etc.) relies on Postgres's default `GRANT EXECUTE TO PUBLIC`, meaning they're also technically callable by the `anon` role (harmless in practice since `auth.uid()` is null there and their internal checks reject it — except `get_list_name_by_code`, which would leak a list's name to an anon caller who guesses/has a 6-char code; low real risk given the ~7·10⁸ combination space, and this is now the exact mechanism the anti-pause GitHub Action deliberately relies on). Worth unifying (explicit grants to `authenticated`, explicit `revoke from public`) for an auditable, homogeneous surface.
- If a user becomes a list's owner via a live ownership transfer while `/lists/:id` is open, the "Invite to this list" link appears live, but the pending-join-requests badge/subscription does not start until reload — it's only wired up inside the initial `loadListDetail()` path when `isOwner()` was already true at load time.
- `join-list.html`'s code/QR toggle uses `role="tab"` without a corresponding `role="tabpanel"` or `aria-controls` link — a screen reader announces "tab" but can't find the associated panel. Either complete the ARIA tabs pattern or downgrade to plain buttons with `aria-pressed`.
- Several refetch/Realtime failure paths are silent beyond a `console.warn` (badges, invitation/request lookups by id, `loadPendingInvitationsCount`). User-facing behavior is unchanged (still no visible error for these secondary/live-data refreshes) — this was a deliberate choice (better stale-but-usable than a noisy error for background data), not a bug, but is worth remembering as the reasoning if it's ever revisited.
- Password minimum length (`CA-01.4`) is only enforced client-side (`minLength(8)`); the real floor is whichever value is set in the Supabase Auth dashboard (default 6). Must be verified in the dashboard, not confirmable from code — see the reminder above under "Key domain reminders".
- A preexisting bug (deliberately preserved, not something any Stage 7 change touched): `list-invite.ts` and `invitations.ts` each track only one "action in progress" id at a time. If a user triggers two actions on different rows in quick succession (e.g. approve request A, then deny request B before A finishes), A finishing re-enables B's row even though B is still in flight. Fixable by switching to a `Set<string>` of active ids if it's ever prioritized.

**Cosmetic / low priority:**

- `/lists/:id/invite` has no Realtime subscription on the list itself — if the owner regenerates the code from another device while this screen is open elsewhere, the old code stays displayed until reload. Low impact (same person, two devices, same moment).
- Minor duplication below the "extract at third use" threshold: the `alert-success`/`alert-warning` result block appears in both `join-list.html` and `list-invite.html`; the four `toReadable*Error` functions share the same shape (normalize → match → Spanish message → fallback) but have domain-specific maps; the inline rename/edit form pattern (input + `appAutofocus` + Guardar/Cancelar + error) is near-identical in `lists.html` and `list-detail.html`.
- Typographic quote style is inconsistent across UI text (mixing «…», "…"/`&quot;`, and straight "…"). No functional impact.
- Build emits a benign warning: `Module 'qrcode' used by 'ng-qrcode' is not ESM` (CommonJS optimization bailout). Doesn't break anything; could be silenced via `allowedCommonJsDependencies` if desired.
- `manifest.webmanifest` doesn't define `theme_color`/`background_color` — an installed PWA's system status bar / splash screen won't follow the in-app light/dark theme. Worth a look during the final PWA real-device pass, now that there's visual context (the theme toggle exists).