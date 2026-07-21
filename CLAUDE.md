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

## Current stage

> **Stage 0 — Foundations.** (Update this line as the project progresses so every session knows where we are.)

## Project structure

> To be filled in after Stage 0 scaffolding. Keep this section updated with the real folder layout so sessions have an accurate map.

## Key domain reminders (full detail in the source of truth)

- List **owner is always also a member** (has a Membership row). Ownership is a pointer on the list, not a boolean on membership.
- Exactly one owner per list at all times.
- `MembershipRequest` has **no status field** — the row's existence means "pending"; resolving it deletes the row. Field `origin` is `INVITE` | `REQUEST`.
- At most one pending request per (user, list), regardless of origin (symmetric rule — see source of truth).
- `invitation_code`: 6 chars, uppercase + digits, excluding ambiguous O/I/L/0/1; auto-generated on list creation; lives as a field on the list.
- `username`: unique, case-insensitive, 3–20 chars, letters/digits/underscore, must start with a letter.
- Deleting a list cascades to its items, memberships, and requests.