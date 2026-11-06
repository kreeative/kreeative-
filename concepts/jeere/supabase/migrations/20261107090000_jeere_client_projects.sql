-- Jeere — client projects (migration `jeere_client_projects`, project « Jeere », ref aezchxfvzfoqlvzchqyk).
--
-- An agency (a web designer on Studio Agence) builds a store for a client under her own account, shows it
-- with a private preview link, then hands it over:
--   « Avec pack entretien » (mode 'entretien'): the client becomes the owner (her dashboard, her payments:
--        sales always go to the owner's own mobile money / Stripe) and the agency keeps an 'agency' access to
--        keep editing; the client can remove that access later (remove_agency_access).
--   « Remise complète » (mode 'remis'): the client becomes the owner and the agency's access is removed.
--   An 'editor' invite only adds a person who may edit (the owner does not change).
--
--   1. public.stores: client_name, project_status ('proposition' | 'en_cours' | 'livre'), handoff ('' |
--      'entretien' | 'remis'), preview_token (random, for « Aperçu privé »). None of them is readable through
--      the table (no column privilege): my_projects() and store_preview() return them to who may see them.
--   2. public.store_members: who else may read and edit a store (role 'agency' | 'editor'); the owner stays
--      stores.owner.
--   3. public.store_invites: an e-mail invited to a store, accepted at the invitee's next log-in.
--   4. Row level security: a store is readable and updatable by its owner or a member; members and invites
--      are managed by the owner. The existing policies (anyone reads published stores, owners do the rest)
--      are kept as they are.
--   5. Functions (security definer, execute for authenticated only): accept_store_invites(), my_projects(),
--      remove_agency_access(store). The one exception is store_preview(slug, token), for anon too: the
--      client opens the private preview before she has an account (the token is the key).
--   6. The owner of a store can now change, but only inside accept_store_invites() (the trigger
--      jeere_stores_touch keeps it otherwise); slug_available() answers « yours » to a member too.
--
-- Works whether or not jeere_wave2 is applied (store_versions, the badge, are looked up at run time), and
-- can be run again (if not exists, drop … if exists, create or replace).

/* ------------------------------------------------------------------ 1. the project columns */

alter table public.stores add column if not exists client_name text;
alter table public.stores add column if not exists project_status text not null default 'en_cours';
alter table public.stores add column if not exists handoff text not null default '';
-- 32 hex characters (122 random bits); every existing row gets its own (a volatile default is computed per row)
alter table public.stores add column if not exists preview_token text not null default replace(gen_random_uuid()::text, '-', '');

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.stores'::regclass and conname = 'stores_client_name_len') then
    alter table public.stores add constraint stores_client_name_len check (client_name is null or char_length(client_name) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.stores'::regclass and conname = 'stores_project_status') then
    alter table public.stores add constraint stores_project_status check (project_status in ('proposition', 'en_cours', 'livre'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.stores'::regclass and conname = 'stores_handoff') then
    alter table public.stores add constraint stores_handoff check (handoff in ('', 'entretien', 'remis'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.stores'::regclass and conname = 'stores_preview_token') then
    alter table public.stores add constraint stores_preview_token check (char_length(preview_token) between 24 and 64);
  end if;
end;
$$;

comment on column public.stores.client_name is 'Client projects: the client''s name (« Joshua Cooker »), set by the agency. Read through my_projects() only.';
comment on column public.stores.project_status is 'proposition | en_cours | livre. Read through my_projects() only.';
comment on column public.stores.handoff is ''''' (never handed over) | entretien (client owner, agency kept) | remis (client owner, agency gone). Written by accept_store_invites() and remove_agency_access() only.';
comment on column public.stores.preview_token is 'The key of the private preview link …/b/<slug>?apercu=<token> (store_preview()). Never readable through the table.';

/* ------------------------------------------------------------------ 2. members */

create table if not exists public.store_members (
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null constraint store_members_role check (role in ('agency', 'editor')),
  added_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
comment on table public.store_members is 'Jeere: who else may read and edit a store (agency: the web designer kept after the handover; editor). The owner is stores.owner and is never a member.';
create index if not exists store_members_user_idx on public.store_members (user_id);

/* ------------------------------------------------------------------ 3. invites */

create table if not exists public.store_invites (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  email text not null
    constraint store_invites_email check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  mode text not null constraint store_invites_mode check (mode in ('entretien', 'remis', 'editor')),
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
comment on table public.store_invites is 'Jeere: an e-mail invited to a store (entretien | remis: she becomes the owner; editor: she may edit). Accepted by accept_store_invites() at her next log-in.';
create unique index if not exists store_invites_pending_uniq on public.store_invites (store_id, email) where accepted_at is null;
create index if not exists store_invites_email_idx on public.store_invites (email) where accepted_at is null;

/* ------------------------------------------------------------------ helpers */

-- The caller's role on a store: 'owner' | 'agency' | 'editor' | null. Security definer so that the policies
-- of stores and store_members can use it without reading each other (no policy recursion).
create or replace function public.jeere_store_role(p_store uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.owner = auth.uid() then 'owner'
    else (select m.role from public.store_members m where m.store_id = s.id and m.user_id = auth.uid())
  end
  from public.stores s
  where s.id = p_store and auth.uid() is not null;
$$;
revoke all on function public.jeere_store_role(uuid) from public, anon;
grant execute on function public.jeere_store_role(uuid) to authenticated;

-- The signed-in person's e-mail (confirmed: the log-in is a one-time code sent to it), lower case, or null
create or replace function public.jeere_my_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null;
$$;
revoke all on function public.jeere_my_email() from public, anon, authenticated;

-- The store's owner never changes from a browser (no column privilege) and, by this trigger, nowhere else
-- either — except inside accept_store_invites(), which says so with the transaction-local setting
-- jeere.owner_transfer (a browser cannot set it: PostgREST runs no SET from a request).
-- Security definer now: the 10-stores count reads stores.owner, a column `authenticated` may not select, so
-- the first version of this trigger refused every insert from a browser (« permission denied for table
-- stores ») — no store had been published from a browser yet.
create or replace function public.jeere_stores_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.slug := lower(new.slug);
  if tg_op = 'INSERT' then
    if new.published then new.published_at := now(); else new.published_at := null; end if;
    if new.owner is not null and coalesce(auth.role(), '') <> 'service_role'
       and (select count(*) from public.stores s where s.owner = new.owner) >= 10 then
      raise exception 'Une personne peut avoir 10 boutiques au plus.' using errcode = 'P0001';
    end if;
  else
    if coalesce(current_setting('jeere.owner_transfer', true), '') <> 'on' then
      new.owner := old.owner;
    end if;
    new.created_at := old.created_at;
    if new.published and not old.published then new.published_at := now();
    elsif new.published then new.published_at := coalesce(old.published_at, now());
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.jeere_stores_touch() from public, anon, authenticated;

-- Invites: the address in lower case; not to oneself; 20 pending at most per store
create or replace function public.jeere_invites_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));
  if new.email = public.jeere_my_email() then
    raise exception 'Vous ne pouvez pas vous inviter vous-même.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.store_invites i where i.store_id = new.store_id and i.accepted_at is null) >= 20 then
    raise exception 'Vingt invitations en attente au plus par boutique.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.jeere_invites_check() from public, anon, authenticated;

drop trigger if exists store_invites_check on public.store_invites;
create trigger store_invites_check
before insert on public.store_invites
for each row execute function public.jeere_invites_check();

/* ------------------------------------------------------------------ 4. row level security */

-- stores: the four owner policies of create_jeere_stores stay; members read and update too
drop policy if exists "Members read their stores" on public.stores;
create policy "Members read their stores"
on public.stores for select
to authenticated
using (public.jeere_store_role(id) in ('agency', 'editor'));

drop policy if exists "Members update their stores" on public.stores;
create policy "Members update their stores"
on public.stores for update
to authenticated
using (public.jeere_store_role(id) in ('agency', 'editor'))
with check (public.jeere_store_role(id) in ('owner', 'agency', 'editor'));

-- The project columns a browser writes (owner or member, by the policies above); handoff and preview_token
-- are the server's. No select privilege on any of the four: my_projects() returns them.
grant insert (client_name, project_status) on public.stores to authenticated;
grant update (client_name, project_status) on public.stores to authenticated;

-- store_members: the owner sees and manages them; a member sees and can remove herself
alter table public.store_members enable row level security;

drop policy if exists "Members and owners read members" on public.store_members;
create policy "Members and owners read members"
on public.store_members for select
to authenticated
using (user_id = (select auth.uid()) or public.jeere_store_role(store_id) = 'owner');

drop policy if exists "Owners add members" on public.store_members;
create policy "Owners add members"
on public.store_members for insert
to authenticated
with check (public.jeere_store_role(store_id) = 'owner' and user_id <> (select auth.uid()));

drop policy if exists "Owners remove members, members leave" on public.store_members;
create policy "Owners remove members, members leave"
on public.store_members for delete
to authenticated
using (user_id = (select auth.uid()) or public.jeere_store_role(store_id) = 'owner');

revoke all on public.store_members from anon, authenticated;
grant select (store_id, user_id, role, added_at) on public.store_members to authenticated;
grant insert (store_id, user_id, role) on public.store_members to authenticated;
grant delete on public.store_members to authenticated;

-- store_invites: the owner invites and cancels; the agency member sees them; the invitee accepts by RPC
alter table public.store_invites enable row level security;

drop policy if exists "Owners and agency read invites" on public.store_invites;
create policy "Owners and agency read invites"
on public.store_invites for select
to authenticated
using (public.jeere_store_role(store_id) in ('owner', 'agency'));

drop policy if exists "Owners invite" on public.store_invites;
create policy "Owners invite"
on public.store_invites for insert
to authenticated
with check (public.jeere_store_role(store_id) = 'owner' and invited_by = (select auth.uid()) and accepted_at is null);

drop policy if exists "Owners cancel invites" on public.store_invites;
create policy "Owners cancel invites"
on public.store_invites for delete
to authenticated
using (accepted_at is null and (public.jeere_store_role(store_id) = 'owner' or invited_by = (select auth.uid())));

revoke all on public.store_invites from anon, authenticated;
grant select (id, store_id, email, mode, invited_by, created_at, accepted_at) on public.store_invites to authenticated;
grant insert (store_id, email, mode) on public.store_invites to authenticated;
grant delete on public.store_invites to authenticated;

/* ------------------------------------------------------------------ 5. functions */

-- At log-in: every pending invite for the caller's e-mail. 'entretien': she becomes the owner, the previous
-- owner becomes an 'agency' member; 'remis': she becomes the owner, the previous owner leaves; 'editor': she
-- is added as an editor. An ownership invite whose author is no longer the owner is stale: left as it is.
create or replace function public.accept_store_invites()
returns table (store_id uuid, slug text, client_name text, store_name text, mode text, role text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  my_email text := public.jeere_my_email();
  inv record;
  st record;
  prev uuid;
begin
  if me is null or my_email is null then
    return;
  end if;
  for inv in
    select i.id, i.store_id, i.mode, i.invited_by
    from public.store_invites i
    where i.email = my_email and i.accepted_at is null
    order by i.created_at
    for update of i
  loop
    select s.id, s.owner, s.slug, s.client_name, s.fiche into st
    from public.stores s where s.id = inv.store_id
    for update of s;
    if not found then continue; end if;

    if inv.mode in ('entretien', 'remis') then
      if st.owner is distinct from me and inv.invited_by is distinct from st.owner then
        continue; -- stale: the store changed hands since she was invited
      end if;
      prev := st.owner;
      if prev is distinct from me then
        perform set_config('jeere.owner_transfer', 'on', true);
        update public.stores s set owner = me, handoff = inv.mode, project_status = 'livre' where s.id = st.id;
        perform set_config('jeere.owner_transfer', 'off', true);
        -- the publish history follows the store (jeere_wave2), when it is there
        if to_regclass('public.store_versions') is not null then
          execute 'update public.store_versions set owner = $1 where store_id = $2' using me, st.id;
        end if;
      else
        update public.stores s set handoff = inv.mode, project_status = 'livre' where s.id = st.id;
      end if;
      delete from public.store_members m where m.store_id = st.id and m.user_id = me;
      if prev is not null and prev is distinct from me then
        if inv.mode = 'entretien' then
          insert into public.store_members as m (store_id, user_id, role) values (st.id, prev, 'agency')
          on conflict (store_id, user_id) do update set role = 'agency';
        else
          delete from public.store_members m where m.store_id = st.id and m.user_id = prev;
        end if;
      end if;
      -- the other pending ownership invites of this store were made by the previous owner: void
      delete from public.store_invites i2
      where i2.store_id = st.id and i2.accepted_at is null and i2.id <> inv.id and i2.mode in ('entretien', 'remis');
      role := 'owner';
    else
      if st.owner is distinct from me then
        insert into public.store_members as m (store_id, user_id, role) values (st.id, me, 'editor')
        on conflict (store_id, user_id) do nothing;
        role := coalesce((select m.role from public.store_members m where m.store_id = st.id and m.user_id = me), 'editor');
      else
        role := 'owner';
      end if;
    end if;

    update public.store_invites i set accepted_at = now() where i.id = inv.id;
    store_id := st.id;
    slug := st.slug;
    client_name := st.client_name;
    store_name := st.fiche -> 'store' ->> 'name';
    mode := inv.mode;
    return next;
  end loop;
end;
$$;
revoke all on function public.accept_store_invites() from public, anon;
grant execute on function public.accept_store_invites() to authenticated;

-- The stores the caller owns or is a member of (without the fiche), newest first: the dashboard's
-- project switcher. agency_email for the owner (« Retirer l'accès Agence »), owner_email for a member,
-- invites (pending) for the owner and the agency.
create or replace function public.my_projects()
returns table (id uuid, slug text, store_name text, client_name text, project_status text, handoff text,
               published boolean, updated_at timestamptz, role text, preview_token text,
               agency_email text, owner_email text, invites jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select s.*, case when s.owner = auth.uid() then 'owner' else m.role end as my_role
    from public.stores s
    left join public.store_members m on m.store_id = s.id and m.user_id = auth.uid()
    where auth.uid() is not null and (s.owner = auth.uid() or m.user_id is not null)
  )
  select x.id, x.slug, x.fiche -> 'store' ->> 'name', x.client_name, x.project_status, x.handoff,
    x.published, x.updated_at, x.my_role, x.preview_token,
    case when x.my_role = 'owner' then (
      select lower(u.email) from public.store_members a join auth.users u on u.id = a.user_id
      where a.store_id = x.id and a.role = 'agency' order by a.added_at limit 1
    ) end,
    case when x.my_role <> 'owner' then (select lower(u.email) from auth.users u where u.id = x.owner) end,
    case when x.my_role in ('owner', 'agency') then coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'mode', i.mode, 'created_at', i.created_at) order by i.created_at)
      from public.store_invites i where i.store_id = x.id and i.accepted_at is null
    ), '[]'::jsonb) else '[]'::jsonb end
  from mine x
  order by x.updated_at desc;
$$;
revoke all on function public.my_projects() from public, anon;
grant execute on function public.my_projects() to authenticated;

-- The owner removes the agency's access (« Retirer l'accès Agence »): the handover becomes complete.
-- Returns how many accesses were removed.
create or replace function public.remove_agency_access(p_store uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if public.jeere_store_role(p_store) is distinct from 'owner' then
    raise exception 'Seule la propriétaire de la boutique peut retirer cet accès.' using errcode = '42501';
  end if;
  delete from public.store_members m where m.store_id = p_store and m.role = 'agency';
  get diagnostics n = row_count;
  update public.stores s set handoff = 'remis' where s.id = p_store and s.handoff = 'entretien';
  return n;
end;
$$;
revoke all on function public.remove_agency_access(uuid) from public, anon;
grant execute on function public.remove_agency_access(uuid) to authenticated;

-- The private preview (« Aperçu privé »): a store, published or not, for whoever has its link. Same fields
-- as the public read (b.js, api/store.js), plus preview: true. null when the slug and token do not match.
create or replace function public.store_preview(p_slug text, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  b boolean;
begin
  if p_slug is null or p_token is null or char_length(p_token) < 24 or char_length(p_token) > 64 then
    return null;
  end if;
  select s.id, s.owner, s.slug, s.fiche, s.show_badge, s.published, s.published_at, s.custom_domain, s.domain_status, s.updated_at
  into r
  from public.stores s
  where s.slug = lower(p_slug) and s.preview_token = p_token;
  if not found then
    return null;
  end if;
  b := r.show_badge;
  -- jeere_wave2: the owner's plan decides the badge, when that function is there
  if to_regprocedure('public.jeere_badge_required(uuid)') is not null then
    execute 'select $1 or public.jeere_badge_required($2)' into b using r.show_badge, r.owner;
  end if;
  return jsonb_build_object(
    'id', r.id, 'slug', r.slug, 'fiche', r.fiche, 'show_badge', r.show_badge, 'badge', b,
    'published', r.published, 'published_at', r.published_at, 'custom_domain', r.custom_domain,
    'domain_status', r.domain_status, 'updated_at', r.updated_at, 'preview', true
  );
end;
$$;
revoke all on function public.store_preview(text, text) from public;
grant execute on function public.store_preview(text, text) to anon, authenticated;

/* ------------------------------------------------------------------ 6. addresses */

-- Is this address free? « yours » for the owner and for a member too (the agency publishing for her client)
create or replace function public.slug_available(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s text := lower(coalesce(p_slug, ''));
  sid uuid;
  who uuid;
begin
  if public.jeere_slug_reserved(s) then
    return jsonb_build_object('available', false, 'reason', 'reserved');
  end if;
  if not public.jeere_slug_valid(s) then
    return jsonb_build_object('available', false, 'reason', 'format');
  end if;
  select st.id, st.owner into sid, who from public.stores st where st.slug = s;
  if not found then
    return jsonb_build_object('available', true, 'reason', 'ok');
  end if;
  if auth.uid() is not null and (who = auth.uid()
     or exists (select 1 from public.store_members m where m.store_id = sid and m.user_id = auth.uid())) then
    return jsonb_build_object('available', true, 'reason', 'yours');
  end if;
  return jsonb_build_object('available', false, 'reason', 'taken');
end;
$$;
revoke all on function public.slug_available(text) from public;
grant execute on function public.slug_available(text) to anon, authenticated;
