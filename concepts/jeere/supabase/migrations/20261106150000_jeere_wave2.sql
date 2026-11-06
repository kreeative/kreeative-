-- Jeere — wave 2 of the Studio audit (migration `jeere_wave2`, project « Jeere », ref aezchxfvzfoqlvzchqyk).
--
--   1. The Studio entitlements live on the server: profiles.plan and profiles.studio are no longer
--      writable from a browser; the `studio-plan` Edge Function (service role) writes them. The badge
--      « Fait avec Jeere » follows the owner's plan, computed by the server (stores.badge, a computed
--      column read with ?select=…,badge, and a trigger that refuses show_badge = false without a plan).
--   2. Publish history: public.store_versions keeps the last 10 published fiches of each store
--      (written by a trigger on stores, read by the owner), for « Restaurer ».
--   3. Seller photos: the public bucket `store-media` (photos uploaded by creer/media.js), each owner
--      writing only under her own folder <auth.uid()>/.
--   4. The stores' sitemap: public.store_sitemap() for the `store-sitemap` Edge Function (service role).

/* ------------------------------------------------------------------ 1. entitlements and badge */

-- Browsers keep first_name, phone and store_name; plan and studio come from the server only.
revoke update (plan, studio) on public.profiles from authenticated, anon;
revoke insert on public.profiles from authenticated, anon;

-- Is the Studio unlocked by this subscription (profiles.studio, the shape of studio/plans.js)?
-- trial: before trialEndsAt · active (solo, pro, agence): before periodEnd + 7 days of grace.
create or replace function public.jeere_studio_unlocked(p jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then false
    when p ->> 'status' = 'trial' and coalesce(p ->> 'trialEndsAt', '') ~ '^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$' then
      (p ->> 'trialEndsAt')::timestamptz > now()
    when p ->> 'status' = 'active' and p ->> 'plan' in ('solo', 'pro', 'agence') and coalesce(p ->> 'periodEnd', '') ~ '^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$' then
      (p ->> 'periodEnd')::timestamptz + interval '7 days' > now()
    else false
  end;
$$;

-- Must the badge show on this owner's stores? Yes unless her Studio is unlocked and she hid it.
create or replace function public.jeere_badge_required(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select not (public.jeere_studio_unlocked(pr.studio) and (pr.studio -> 'hideBadge') is distinct from 'false'::jsonb)
    from public.profiles pr where pr.id = p_owner
  ), true);
$$;
revoke all on function public.jeere_badge_required(uuid) from public, anon, authenticated;

-- stores.badge: what the store page shows, decided at read time from the owner's plan (so a lapsed
-- subscription brings the badge back without anyone writing the row). PostgREST computed column.
create or replace function public.badge(s public.stores)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.show_badge or public.jeere_badge_required(s.owner);
$$;
revoke all on function public.badge(public.stores) from public;
grant execute on function public.badge(public.stores) to anon, authenticated;

-- A browser cannot store show_badge = false without a plan that allows it.
create or replace function public.jeere_stores_badge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.show_badge = false and new.owner is not null and public.jeere_badge_required(new.owner) then
    new.show_badge := true;
  end if;
  return new;
end;
$$;
revoke all on function public.jeere_stores_badge() from public, anon, authenticated;

drop trigger if exists stores_badge on public.stores;
create trigger stores_badge
before insert or update of show_badge, owner on public.stores
for each row execute function public.jeere_stores_badge();

/* ------------------------------------------------------------------ 2. publish history */

create table if not exists public.store_versions (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  owner uuid references auth.users (id) on delete cascade,
  slug text not null,
  fiche jsonb not null
    constraint store_versions_fiche_object check (jsonb_typeof(fiche) = 'object')
    constraint store_versions_fiche_size check (octet_length(fiche::text) <= 1048576),
  published_at timestamptz not null default now()
);
comment on table public.store_versions is 'Jeere: the last 10 published fiches of each store (trigger on stores). The owner reads them; nobody writes them from a browser. « Restaurer » publishes one again.';
create index if not exists store_versions_store_idx on public.store_versions (store_id, published_at desc);
create index if not exists store_versions_owner_idx on public.store_versions (owner);

alter table public.store_versions enable row level security;
drop policy if exists "Owners read their versions" on public.store_versions;
create policy "Owners read their versions"
on public.store_versions for select
to authenticated
using (owner = (select auth.uid()));
revoke all on public.store_versions from anon, authenticated;
grant select (id, store_id, slug, fiche, published_at) on public.store_versions to authenticated;

-- Every publication (published, and a new fiche or back online) is a version; 10 kept per store.
create or replace function public.jeere_stores_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.published and (tg_op = 'INSERT' or new.fiche is distinct from old.fiche or not old.published) then
    insert into public.store_versions (store_id, owner, slug, fiche) values (new.id, new.owner, new.slug, new.fiche);
    delete from public.store_versions v
    where v.store_id = new.id
      and v.id not in (select v2.id from public.store_versions v2 where v2.store_id = new.id order by v2.published_at desc, v2.id desc limit 10);
  end if;
  return new;
end;
$$;
revoke all on function public.jeere_stores_version() from public, anon, authenticated;

drop trigger if exists stores_version on public.stores;
create trigger stores_version
after insert or update of fiche, published on public.stores
for each row execute function public.jeere_stores_version();

-- The signed-in person's versions of one store (without the fiche), newest first.
create or replace function public.store_history(p_store uuid)
returns table (id bigint, slug text, published_at timestamptz, bytes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.slug, v.published_at, octet_length(v.fiche::text)
  from public.store_versions v
  where v.store_id = p_store and v.owner = auth.uid()
  order by v.published_at desc, v.id desc
  limit 10;
$$;
revoke all on function public.store_history(uuid) from public, anon;
grant execute on function public.store_history(uuid) to authenticated;

/* ------------------------------------------------------------------ 3. seller photos */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-media', 'store-media', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Public bucket: the files are served by their public URL without any policy. No select policy for
-- anon (nobody can list the bucket); the owner reads, writes and deletes only under <her id>/.
drop policy if exists "store-media: owners read their folder" on storage.objects;
create policy "store-media: owners read their folder"
on storage.objects for select
to authenticated
using (bucket_id = 'store-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "store-media: owners upload to their folder" on storage.objects;
create policy "store-media: owners upload to their folder"
on storage.objects for insert
to authenticated
with check (bucket_id = 'store-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "store-media: owners replace in their folder" on storage.objects;
create policy "store-media: owners replace in their folder"
on storage.objects for update
to authenticated
using (bucket_id = 'store-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'store-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "store-media: owners delete in their folder" on storage.objects;
create policy "store-media: owners delete in their folder"
on storage.objects for delete
to authenticated
using (bucket_id = 'store-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

/* ------------------------------------------------------------------ 4. sitemap */

-- Every published store, its pages' slugs and its products' ids (no fiche, no images).
create or replace function public.store_sitemap()
returns table (slug text, updated_at timestamptz, custom_domain text, domain_status text, pages text[], products text[], noindex boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.slug, s.updated_at, s.custom_domain, s.domain_status,
    coalesce(array(
      select p ->> 'slug' from jsonb_array_elements(case when jsonb_typeof(s.fiche -> 'pages') = 'array' then s.fiche -> 'pages' else '[]'::jsonb end) p
      where coalesce(p ->> 'slug', '') ~ '^[a-z0-9-]{1,60}$' and (p -> 'seo' -> 'noindex') is distinct from 'true'::jsonb
    ), '{}'),
    coalesce(array(
      select p ->> 'id' from jsonb_array_elements(case when jsonb_typeof(s.fiche -> 'products') = 'array' then s.fiche -> 'products' else '[]'::jsonb end) p
      where coalesce(p ->> 'id', '') ~ '^[A-Za-z0-9_-]{1,40}$'
    ), '{}'),
    (s.fiche -> 'store' -> 'seo' -> 'noindex') is not distinct from 'true'::jsonb
  from public.stores s
  where s.published
  order by s.updated_at desc
  limit 5000;
$$;
revoke all on function public.store_sitemap() from public, anon, authenticated;
grant execute on function public.store_sitemap() to service_role;
