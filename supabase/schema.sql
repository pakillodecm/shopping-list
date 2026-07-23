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

-- Owner invites a registered user by username or email (RF-10)
create function public.invite_user_to_list(p_list_id uuid, p_identifier text)
returns public.membership_requests
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
  if not exists (select 1 from public.lists where id = p_list_id and owner_id = auth.uid()) then
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
    select 1 from public.memberships where user_id = target_user_id and list_id = p_list_id
  ) into is_already_member;

  if is_already_member then
    raise exception 'That user is already a member of this list';
  end if;

  select * into existing_request
  from public.membership_requests
  where user_id = target_user_id and list_id = p_list_id;

  if found then
    return existing_request;
  end if;

  insert into public.membership_requests (user_id, list_id, origin)
  values (target_user_id, p_list_id, 'INVITE')
  returning * into new_request;

  return new_request;
end;
$$;

-- User requests to join a list via its invitation code (RF-15)
create function public.request_to_join_by_code(p_code text)
returns public.membership_requests
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
  from public.lists
  where invitation_code = upper(p_code);

  if not found then
    raise exception 'Invalid invitation code';
  end if;

  if target_list.owner_id = auth.uid() then
    raise exception 'You already own this list';
  end if;

  select exists(
    select 1 from public.memberships where user_id = auth.uid() and list_id = target_list.id
  ) into is_already_member;

  if is_already_member then
    raise exception 'You are already a member of this list';
  end if;

  select * into existing_request
  from public.membership_requests
  where user_id = auth.uid() and list_id = target_list.id;

  if found then
    return existing_request;
  end if;

  insert into public.membership_requests (user_id, list_id, origin)
  values (auth.uid(), target_list.id, 'REQUEST')
  returning * into new_request;

  return new_request;
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