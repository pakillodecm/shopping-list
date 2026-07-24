-- ============================================================================
-- shopping-list — Database schema
-- ============================================================================
-- This file is a versioned record of the schema as built manually in the
-- Supabase SQL Editor. It documents the full schema as it exists today:
-- tables, functions, triggers and RLS policies for profiles, lists,
-- memberships, membership_requests, list_items and products.
--
-- This includes the Stage 5 invitation RPC functions (invite_user_to_list,
-- request_to_join_by_code, accept_invitation, reject_invitation,
-- approve_join_request, deny_join_request), built ahead of schedule as pure
-- backend work while designing the full data model during Stages 1-2 — see
-- the "Build order" exception in CLAUDE.md. They are correct and RLS-safe
-- at the database level but have no frontend wiring yet.
--
-- NOTE: This file is NOT wired into any migration runner. The live database
-- already has this schema applied via the Supabase dashboard. This file
-- exists so the schema is versioned and reproducible, e.g. to recreate the
-- project from scratch if ever needed.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  first_name text not null,
  last_name text not null,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness for username
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- Enforce username format at the database level (CA-01.8):
-- 3-20 chars, starts with a letter, only letters/digits/underscore
alter table public.profiles
add constraint username_format
check (username ~ '^[a-zA-Z][a-zA-Z0-9_]{2,19}$');

-- Function: creates a profile row right after a new auth user is created
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, first_name, last_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  );
  return new;
end;
$$;

-- Trigger: fires the function every time a row is inserted into auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: profiles
alter table public.profiles enable row level security;

create policy "Profiles are viewable by authenticated users"
on public.profiles
for select
to authenticated
using (true);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

grant select, update on public.profiles to authenticated;


-- ----------------------------------------------------------------------------
-- lists
-- ----------------------------------------------------------------------------

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  invitation_code text not null unique,
  created_at timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- memberships
-- ----------------------------------------------------------------------------

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (user_id, list_id)
);

alter table public.memberships enable row level security;

-- Function: checks membership bypassing RLS (security definer), so the
-- "fellow list members" policy below doesn't query memberships from within
-- its own policy and trigger infinite recursion (42P17).
create function public.is_list_member(target_list_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships
    where list_id = target_list_id and user_id = auth.uid()
  );
$$;

create policy "Memberships viewable by fellow list members"
on public.memberships
for select
to authenticated
using (
  user_id = auth.uid() or public.is_list_member(list_id)
);

grant select on public.memberships to authenticated;

-- Stage 5 (Realtime on invitations): gaining access to a list (an approved
-- join request or an accepted invite) is an INSERT on memberships, not an
-- UPDATE on lists — the list row itself never changes — so the client needs
-- its own subscription on this table to notice it live. A table must be in
-- this publication for Postgres to emit any logical-replication events for
-- it at all, regardless of which event types a client subscribes to.
alter publication supabase_realtime add table public.memberships;

-- Not required for the INSERT-only subscription above (INSERT's "new" row
-- is always sent in full regardless of replica identity — only "old" rows
-- on UPDATE/DELETE are truncated under the default). Set now anyway, ahead
-- of Stage 6 (leave list / remove member, which DELETEs a membership row),
-- to avoid hitting the exact same silent-drop bug a fourth time once that
-- lands — see the identical reasoning already applied to list_items, lists,
-- and membership_requests. Pure schema config, no UI, no security
-- implication either way (see CLAUDE.md's "Build order" exception).
alter table public.memberships replica identity full;

alter table public.lists enable row level security;

create policy "Lists are viewable by owner or members"
on public.lists
for select
to authenticated
using (
  owner_id = auth.uid()
  or id in (select list_id from public.memberships where user_id = auth.uid())
);

create policy "Only owner can update list"
on public.lists
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Only owner can delete list"
on public.lists
for delete
to authenticated
using (owner_id = auth.uid());

grant select, update, delete on public.lists to authenticated;


-- ----------------------------------------------------------------------------
-- Invitation code generation + atomic list creation
-- ----------------------------------------------------------------------------

-- Generates a random 6-character invitation code
-- Alphabet excludes ambiguous characters: O, I, L, 0, 1
create function public.generate_invitation_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- Creates a list and the owner's membership atomically.
-- If the app calls this function, both rows are created together or neither is.
create function public.create_list_with_owner(list_name text)
returns public.lists
language plpgsql
security definer
set search_path = public
as $$
declare
  new_list public.lists;
  code text;
  code_exists boolean;
begin
  loop
    code := public.generate_invitation_code();
    select exists(select 1 from public.lists where invitation_code = code) into code_exists;
    exit when not code_exists;
  end loop;

  insert into public.lists (owner_id, name, invitation_code)
  values (auth.uid(), list_name, code)
  returning * into new_list;

  insert into public.memberships (user_id, list_id, joined_at)
  values (auth.uid(), new_list.id, now());

  return new_list;
end;
$$;

-- Owner regenerates a list's invitation code, invalidating the old one for
-- new join requests (RF-14, CA-12.3). Existing pending membership_requests
-- are untouched — they were created against the old code but exist as rows
-- independent of it, so they still resolve normally.
create function public.regenerate_invitation_code(p_list_id uuid)
returns public.lists
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_list public.lists;
  code text;
  code_exists boolean;
begin
  if not exists (select 1 from public.lists where id = p_list_id and owner_id = auth.uid()) then
    raise exception 'Only the list owner can regenerate the invitation code';
  end if;

  loop
    code := public.generate_invitation_code();
    select exists(select 1 from public.lists where invitation_code = code) into code_exists;
    exit when not code_exists;
  end loop;

  update public.lists
  set invitation_code = code
  where id = p_list_id
  returning * into updated_list;

  return updated_list;
end;
$$;


-- ----------------------------------------------------------------------------
-- Leave list, ownership transfer & member removal (Stage 6, HU-09 / RF-08)
-- ----------------------------------------------------------------------------

-- Member leaves a list, with ownership transfer or sole-owner deletion.
--
-- - Non-owner (CA-09.1): just deletes their own membership row. This needs
--   security definer because memberships has no delete policy at all (all
--   existing writes to it go through security-definer functions like
--   accept_invitation/approve_join_request) — a plain authenticated delete
--   would be blocked by RLS's default deny.
-- - Owner with other members (CA-09.2/CA-09.3): transfers owner_id to
--   p_successor_id if given, otherwise to the member with the earliest
--   joined_at (stable tiebreak by id), then deletes the outgoing owner's
--   membership. Security definer is required here too: "Only owner can
--   update list" has `with check (owner_id = auth.uid())`, which would
--   reject an update that changes owner_id to someone else.
-- - Sole owner (CA-09.4/09.5): deletes the list outright. Cascades to
--   list_items, memberships and membership_requests via their existing
--   `on delete cascade` FKs to lists(id) — no new cascade needed. CA-09.4's
--   confirmation step is a frontend concern (same ConfirmModal pattern as
--   other destructive actions); this function performs the deletion
--   unconditionally once called, same as how list delete itself has no
--   confirmation param at the DB layer.
--
-- Returns which outcome happened (list_deleted / new_owner_id) instead of
-- letting the frontend infer it from its own call context — same
-- already_pending criterion used in invite_user_to_list/request_to_join_by_code.
-- Output column names (list_deleted, new_owner_id) don't collide with any
-- real table column, but every table reference is still aliased and
-- qualified anyway, matching the defensive style used since the 42702
-- ambiguity bugs hit those two Stage 5 functions.
create function public.leave_list(p_list_id uuid, p_successor_id uuid default null)
returns table (list_deleted boolean, new_owner_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  is_owner boolean;
  other_members_count int;
  successor_is_member boolean;
  v_new_owner_id uuid;
begin
  if not exists (
    select 1 from public.memberships m
    where m.list_id = p_list_id and m.user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this list';
  end if;

  select exists(
    select 1 from public.lists l where l.id = p_list_id and l.owner_id = auth.uid()
  ) into is_owner;

  if not is_owner then
    delete from public.memberships m
    where m.list_id = p_list_id and m.user_id = auth.uid();

    return query select false, null::uuid;
    return;
  end if;

  select count(*) into other_members_count
  from public.memberships m
  where m.list_id = p_list_id and m.user_id != auth.uid();

  if other_members_count = 0 then
    delete from public.lists l where l.id = p_list_id and l.owner_id = auth.uid();

    return query select true, null::uuid;
    return;
  end if;

  if p_successor_id is not null then
    if p_successor_id = auth.uid() then
      raise exception 'Cannot transfer ownership to yourself';
    end if;

    select exists(
      select 1 from public.memberships m
      where m.list_id = p_list_id and m.user_id = p_successor_id
    ) into successor_is_member;

    if not successor_is_member then
      raise exception 'The chosen successor is not a member of this list';
    end if;

    v_new_owner_id := p_successor_id;
  else
    select m.user_id into v_new_owner_id
    from public.memberships m
    where m.list_id = p_list_id and m.user_id != auth.uid()
    order by m.joined_at asc, m.id asc
    limit 1;
  end if;

  update public.lists l
  set owner_id = v_new_owner_id
  where l.id = p_list_id;

  delete from public.memberships m
  where m.list_id = p_list_id and m.user_id = auth.uid();

  return query select false, v_new_owner_id;
end;
$$;

grant execute on function public.leave_list(uuid, uuid) to authenticated;

-- Owner removes a member from a list (RF-08). Unlike leave_list, there's no
-- ambiguity in the outcome to report back (always "that membership is
-- gone"), so returns void is enough — same as accept_invitation/
-- reject_invitation/approve_join_request/deny_join_request. Checks are
-- ordered so each error is the most specific one that actually applies:
-- permission first (no info leaked about p_user_id to a non-owner), then the
-- self-removal guard (that's what leave_list is for), then membership itself.
create function public.remove_member(p_list_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.lists l where l.id = p_list_id and l.owner_id = auth.uid()
  ) then
    raise exception 'Only the list owner can remove members';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Use leave_list to remove yourself from a list';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.list_id = p_list_id and m.user_id = p_user_id
  ) then
    raise exception 'That user is not a member of this list';
  end if;

  delete from public.memberships m
  where m.list_id = p_list_id and m.user_id = p_user_id;
end;
$$;

grant execute on function public.remove_member(uuid, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- membership_requests
-- ----------------------------------------------------------------------------

-- Origin enum: who initiated the request
create type public.membership_request_origin as enum ('INVITE', 'REQUEST');

-- Membership requests: unifies invites and join requests.
-- No status column — a row's existence means "pending". Resolving it deletes the row.
create table public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  origin public.membership_request_origin not null,
  created_at timestamptz not null default now(),
  unique (user_id, list_id)
);

alter table public.membership_requests enable row level security;

create policy "Requests viewable by requester or list owner"
on public.membership_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or list_id in (select id from public.lists where owner_id = auth.uid())
);

grant select on public.membership_requests to authenticated;

-- Stage 5 (Realtime on invitations): membership_requests must emit
-- postgres_changes events so /invitations and /lists/:id/invite update
-- live. Same reasoning as list_items and lists in Stage 4: under the
-- default replica identity, a DELETE's "old" row only carries the primary
-- key, which isn't enough for a postgres_changes filter (list_id, user_id)
-- or RLS evaluation to match it, so the event would be dropped silently.
-- FULL includes every column in the old row, fixing that for deletes.
alter publication supabase_realtime add table public.membership_requests;
alter table public.membership_requests replica identity full;

-- Owner invites a registered user by username or email (RF-10).
-- Returns already_pending = true when a membership_requests row for this
-- (user, list) pair already existed (of either origin) and was returned
-- as-is, vs false when this call just inserted a brand-new INVITE row —
-- the frontend needs this to tell "invitation sent" apart from "there's
-- already something pending with this person" (CA-10.1 vs CA-10.4).
--
-- Watch for column-shadowing (42702 "column reference is ambiguous") with
-- `returns table (...)`: each output column becomes an implicit PL/pgSQL
-- variable in scope for the whole function body, so any *unqualified*
-- column reference that shares a name with an output column (id, user_id,
-- list_id here) becomes ambiguous against the actual table column.
-- Every table reference in this function's WHERE clauses is aliased and
-- fully qualified to avoid it.
create function public.invite_user_to_list(p_list_id uuid, p_identifier text)
returns table (
  id uuid,
  user_id uuid,
  list_id uuid,
  origin public.membership_request_origin,
  created_at timestamptz,
  already_pending boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  is_already_member boolean;
  existing_request public.membership_requests;
  new_request public.membership_requests;
begin
  if not exists (
    select 1 from public.lists l where l.id = p_list_id and l.owner_id = auth.uid()
  ) then
    raise exception 'Only the list owner can invite members';
  end if;

  select p.id into target_user_id
  from public.profiles p
  left join auth.users u on u.id = p.id
  where lower(p.username) = lower(p_identifier) or lower(u.email) = lower(p_identifier)
  limit 1;

  if target_user_id is null then
    raise exception 'No user found with that username or email';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot invite yourself';
  end if;

  select exists(
    select 1 from public.memberships m
    where m.user_id = target_user_id and m.list_id = p_list_id
  ) into is_already_member;

  if is_already_member then
    raise exception 'That user is already a member of this list';
  end if;

  select * into existing_request
  from public.membership_requests mr
  where mr.user_id = target_user_id and mr.list_id = p_list_id;

  if found then
    return query
      select existing_request.id, existing_request.user_id, existing_request.list_id,
             existing_request.origin, existing_request.created_at, true;
    return;
  end if;

  insert into public.membership_requests (user_id, list_id, origin)
  values (target_user_id, p_list_id, 'INVITE')
  returning * into new_request;

  return query
    select new_request.id, new_request.user_id, new_request.list_id,
           new_request.origin, new_request.created_at, false;
end;
$$;

-- User requests to join a list via its invitation code (RF-15).
-- Returns already_pending the same way invite_user_to_list does — see the
-- comment on that function for why (CA-13.1 vs CA-13.4) and the
-- column-shadowing gotcha this return shape has with `returns table (...)`,
-- which is why every table reference below is aliased and qualified.
create function public.request_to_join_by_code(p_code text)
returns table (
  id uuid,
  user_id uuid,
  list_id uuid,
  origin public.membership_request_origin,
  created_at timestamptz,
  already_pending boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_list public.lists;
  is_already_member boolean;
  existing_request public.membership_requests;
  new_request public.membership_requests;
begin
  select * into target_list
  from public.lists l
  where l.invitation_code = upper(p_code);

  if not found then
    raise exception 'Invalid invitation code';
  end if;

  if target_list.owner_id = auth.uid() then
    raise exception 'You already own this list';
  end if;

  select exists(
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.list_id = target_list.id
  ) into is_already_member;

  if is_already_member then
    raise exception 'You are already a member of this list';
  end if;

  select * into existing_request
  from public.membership_requests mr
  where mr.user_id = auth.uid() and mr.list_id = target_list.id;

  if found then
    return query
      select existing_request.id, existing_request.user_id, existing_request.list_id,
             existing_request.origin, existing_request.created_at, true;
    return;
  end if;

  insert into public.membership_requests (user_id, list_id, origin)
  values (auth.uid(), target_list.id, 'REQUEST')
  returning * into new_request;

  return query
    select new_request.id, new_request.user_id, new_request.list_id,
           new_request.origin, new_request.created_at, false;
end;
$$;

-- Invitee accepts an INVITE (CA-11.1)
create function public.accept_invitation(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.membership_requests;
begin
  select * into req from public.membership_requests where id = p_request_id;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if req.user_id != auth.uid() or req.origin != 'INVITE' then
    raise exception 'You cannot accept this request';
  end if;

  insert into public.memberships (user_id, list_id, joined_at)
  values (req.user_id, req.list_id, now());

  delete from public.membership_requests where id = p_request_id;
end;
$$;

-- Invitee rejects an INVITE (CA-11.2)
create function public.reject_invitation(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.membership_requests;
begin
  select * into req from public.membership_requests where id = p_request_id;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if req.user_id != auth.uid() or req.origin != 'INVITE' then
    raise exception 'You cannot reject this request';
  end if;

  delete from public.membership_requests where id = p_request_id;
end;
$$;

-- Owner approves a REQUEST (CA-14.2)
create function public.approve_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.membership_requests;
  is_owner boolean;
begin
  select * into req from public.membership_requests where id = p_request_id;

  if not found then
    raise exception 'Request not found';
  end if;

  select exists(
    select 1 from public.lists where id = req.list_id and owner_id = auth.uid()
  ) into is_owner;

  if not is_owner or req.origin != 'REQUEST' then
    raise exception 'You cannot approve this request';
  end if;

  insert into public.memberships (user_id, list_id, joined_at)
  values (req.user_id, req.list_id, now());

  delete from public.membership_requests where id = p_request_id;
end;
$$;

-- Owner denies a REQUEST (CA-14.3)
create function public.deny_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.membership_requests;
  is_owner boolean;
begin
  select * into req from public.membership_requests where id = p_request_id;

  if not found then
    raise exception 'Request not found';
  end if;

  select exists(
    select 1 from public.lists where id = req.list_id and owner_id = auth.uid()
  ) into is_owner;

  if not is_owner or req.origin != 'REQUEST' then
    raise exception 'You cannot deny this request';
  end if;

  delete from public.membership_requests where id = p_request_id;
end;
$$;

-- Stage 5 (Invitations UI): an invitee needs to see which list a pending
-- INVITE points to (its name) before deciding whether to accept it
-- (RF-11/RF-12), but the base "owner or member" policy on lists doesn't
-- grant that — an invitee isn't a member yet. Uses the same
-- security-definer pattern as is_list_member so the check reads
-- membership_requests without going through its RLS, avoiding a policy
-- cycle (lists policy -> membership_requests policy -> lists policy) that a
-- plain subquery would create.
create function public.has_pending_invite(target_list_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.membership_requests
    where list_id = target_list_id and user_id = auth.uid() and origin = 'INVITE'
  );
$$;

create policy "Lists are viewable by invited users"
on public.lists
for select
to authenticated
using (
  public.has_pending_invite(id)
);

-- Stage 5 (QR scan): lets any authenticated user look up a list's name by
-- invitation code before deciding whether to request to join (RF-15, DT-9) —
-- confirmation copy ("¿Quieres unirte a la lista 'X'?") needs the name, but
-- the requester isn't a member yet so the base "owner or member" RLS policy
-- on lists doesn't grant them a row. Same security-definer pattern as
-- is_list_member/has_pending_invite: bypasses RLS deliberately, but the
-- surface is intentionally tiny (only the name, not the full row) since it
-- must be safe for any authenticated user, not just the eventual member.
create function public.get_list_name_by_code(p_code text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select name from public.lists where invitation_code = upper(p_code);
$$;


-- ----------------------------------------------------------------------------
-- products (catalog — Phase 2, empty in MVP) + list_items
-- ----------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  text text not null,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

-- Automatically updates modified_at whenever a list_item row changes
create function public.set_modified_at()
returns trigger
language plpgsql
as $$
begin
  new.modified_at = now();
  return new;
end;
$$;

create trigger on_list_item_updated
  before update on public.list_items
  for each row execute function public.set_modified_at();

alter table public.list_items enable row level security;

create policy "Items viewable by list members"
on public.list_items
for select
to authenticated
using (
  list_id in (select list_id from public.memberships where user_id = auth.uid())
);

create policy "Items insertable by list members"
on public.list_items
for insert
to authenticated
with check (
  list_id in (select list_id from public.memberships where user_id = auth.uid())
);

create policy "Items updatable by list members"
on public.list_items
for update
to authenticated
using (
  list_id in (select list_id from public.memberships where user_id = auth.uid())
)
with check (
  list_id in (select list_id from public.memberships where user_id = auth.uid())
);

create policy "Items deletable by list members"
on public.list_items
for delete
to authenticated
using (
  list_id in (select list_id from public.memberships where user_id = auth.uid())
);

grant select, insert, update, delete on public.list_items to authenticated;

-- Stage 4 (Realtime): list_items must emit postgres_changes events so
-- subscribed clients get INSERT/UPDATE/DELETE notifications, filtered by
-- list_id, respecting the RLS policies above.
alter publication supabase_realtime add table public.list_items;

-- Required for DELETE events to carry list_id: with the default replica
-- identity, Postgres only includes the primary key in the "old" row sent
-- over logical replication, so a postgres_changes filter on list_id can
-- never match a DELETE and the event gets silently dropped. FULL includes
-- every column in the old row, letting the filter work for deletes too.
alter table public.list_items replica identity full;

-- Stage 4 (Realtime): lists needs a modified_at column so the shared
-- mergeChange() helper (which requires id + modified_at) can be reused for
-- list events exactly like it is for list_items.
alter table public.lists add column modified_at timestamptz not null default now();

create trigger on_list_updated
  before update on public.lists
  for each row execute function public.set_modified_at();

-- Stage 4 (Realtime): lists must emit postgres_changes events. Unlike
-- list_items there is no single scalar column (like list_id) to filter on —
-- "owner or member" requires a join with memberships that a postgres_changes
-- filter string can't express. So clients subscribe with no filter at all,
-- relying on Realtime evaluating the "Lists are viewable by owner or
-- members" RLS policy per subscriber before delivering each event. Verified
-- empirically in Stage 4 testing: a user with no relationship to a list
-- receives no events for it, while the owner does.
alter publication supabase_realtime add table public.lists;

-- Same reasoning as list_items: DELETE's "old" row only carries the primary
-- key under the default replica identity, which isn't enough for Realtime to
-- evaluate the RLS policy above (it needs owner_id) and the event would be
-- dropped silently.
alter table public.lists replica identity full;

-- products: no write policy yet — empty and unused until Phase 2 catalog work.
-- RLS is enabled with no policies, so it's inaccessible by default (safe default).
alter table public.products enable row level security;