-- « En direct » for a site that is not a Jehre store (The Ivory Sukundu): same table, a name instead of a store.
-- Only the names listed in public.visit_sites are counted; only the people of public.site_editors read them.

alter table public.store_visits alter column store_id drop not null;
alter table public.store_visits add column if not exists site text;
create index if not exists store_visits_site_at on public.store_visits (site, at desc) where site is not null;

create table if not exists public.visit_sites (site text primary key, name text not null, created_at timestamptz not null default now());
alter table public.visit_sites enable row level security;
revoke all on public.visit_sites from anon, authenticated;
insert into public.visit_sites (site, name) values ('the-ivory-sukundu', 'The Ivory Sukundu') on conflict do nothing;

create or replace function public.log_store_visit(p_slug text, p_visitor text, p_country text, p_city text, p_lat real, p_lon real, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare sid uuid; sname text;
begin
  if p_slug is null or p_visitor is null or length(p_visitor) not between 8 and 64 then return; end if;
  select id into sid from public.stores where slug = lower(p_slug) and published is true;
  if sid is null then
    select site into sname from public.visit_sites where site = lower(p_slug);
    if sname is null then return; end if;
  end if;
  if exists (select 1 from public.store_visits where ((sid is not null and store_id = sid) or (sid is null and site = sname)) and visitor = p_visitor and at > now() - interval '20 seconds') then return; end if;
  if (select count(*) from public.store_visits where ((sid is not null and store_id = sid) or (sid is null and site = sname)) and at > now() - interval '1 day') >= 20000 then return; end if;
  insert into public.store_visits (store_id, site, visitor, country, city, lat, lon, path) values (
    sid, sname, p_visitor,
    case when p_country ~ '^[A-Za-z]{2}$' then upper(p_country) end,
    nullif(left(coalesce(p_city, ''), 80), ''),
    case when p_lat between -90 and 90 then p_lat end,
    case when p_lon between -180 and 180 then p_lon end,
    nullif(left(coalesce(p_path, ''), 200), '')
  );
end $$;

create or replace function public.site_visits_live(p_site text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or mail = '' or not exists (select 1 from public.site_editors where lower(email) = mail)
     or not exists (select 1 from public.visit_sites where site = p_site) then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'now', (select count(distinct visitor) from public.store_visits where site = p_site and at > now() - interval '5 minutes'),
    'today', (select count(distinct visitor) from public.store_visits where site = p_site and at > now() - interval '24 hours'),
    'week', (select count(distinct visitor) from public.store_visits where site = p_site and at > now() - interval '7 days'),
    'points', coalesce((select jsonb_agg(jsonb_build_object('lat', lat, 'lon', lon, 'city', city, 'country', country, 'at', at, 'live', at > now() - interval '5 minutes') order by at desc)
      from (select distinct on (visitor) lat, lon, city, country, at from public.store_visits
            where site = p_site and at > now() - interval '24 hours' and lat is not null and lon is not null
            order by visitor, at desc limit 400) v), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'n', n) order by n desc)
      from (select country, count(distinct visitor) as n from public.store_visits
            where site = p_site and at > now() - interval '24 hours' and country is not null group by country order by 2 desc limit 8) c), '[]'::jsonb)
  );
end $$;
revoke all on function public.site_visits_live(text) from public, anon;
grant execute on function public.site_visits_live(text) to authenticated;
