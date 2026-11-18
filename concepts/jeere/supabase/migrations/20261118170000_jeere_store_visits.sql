-- « En direct »: who is looking at a store, and from where. One row per visit (a visitor counted again after
-- 20 seconds at most). No IP address is kept: `visitor` is a one-way hash that changes every day, and the place
-- is the city the visit seems to come from (given by the host of the store pages). Rows older than 30 days go.

create table if not exists public.store_visits (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  at timestamptz not null default now(),
  visitor text not null,
  country text,
  city text,
  lat real,
  lon real,
  path text
);
create index if not exists store_visits_store_at on public.store_visits (store_id, at desc);
alter table public.store_visits enable row level security;
revoke all on public.store_visits from anon, authenticated;

-- written by the store pages (api/visit.js, with the public key): a published store only, sane values, a brake
create or replace function public.log_store_visit(p_slug text, p_visitor text, p_country text, p_city text, p_lat real, p_lon real, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if p_slug is null or p_visitor is null or length(p_visitor) not between 8 and 64 then return; end if;
  select id into sid from public.stores where slug = lower(p_slug) and published is true;
  if sid is null then return; end if;
  if exists (select 1 from public.store_visits where store_id = sid and visitor = p_visitor and at > now() - interval '20 seconds') then return; end if;
  if (select count(*) from public.store_visits where store_id = sid and at > now() - interval '1 day') >= 20000 then return; end if;
  insert into public.store_visits (store_id, visitor, country, city, lat, lon, path) values (
    sid, p_visitor,
    case when p_country ~ '^[A-Za-z]{2}$' then upper(p_country) end,
    nullif(left(coalesce(p_city, ''), 80), ''),
    case when p_lat between -90 and 90 then p_lat end,
    case when p_lon between -180 and 180 then p_lon end,
    nullif(left(coalesce(p_path, ''), 200), '')
  );
end $$;
revoke all on function public.log_store_visit(text, text, text, text, real, real, text) from public;
grant execute on function public.log_store_visit(text, text, text, text, real, real, text) to anon, authenticated;

-- read by the dashboard: the owner of the store, or a member of its team
create or replace function public.store_visits_live(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not (
    exists (select 1 from public.stores where id = p_store and owner = me)
    or exists (select 1 from public.store_members where store_id = p_store and user_id = me)
  ) then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object(
    'ok', true,
    'now', (select count(distinct visitor) from public.store_visits where store_id = p_store and at > now() - interval '5 minutes'),
    'today', (select count(distinct visitor) from public.store_visits where store_id = p_store and at > now() - interval '24 hours'),
    'week', (select count(distinct visitor) from public.store_visits where store_id = p_store and at > now() - interval '7 days'),
    'points', coalesce((select jsonb_agg(jsonb_build_object('lat', lat, 'lon', lon, 'city', city, 'country', country, 'at', at, 'live', at > now() - interval '5 minutes') order by at desc)
      from (select distinct on (visitor) lat, lon, city, country, at from public.store_visits
            where store_id = p_store and at > now() - interval '24 hours' and lat is not null and lon is not null
            order by visitor, at desc limit 400) v), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'n', n) order by n desc)
      from (select country, count(distinct visitor) as n from public.store_visits
            where store_id = p_store and at > now() - interval '24 hours' and country is not null group by country order by 2 desc limit 8) c), '[]'::jsonb)
  );
end $$;
revoke all on function public.store_visits_live(uuid) from public, anon;
grant execute on function public.store_visits_live(uuid) to authenticated;

-- 30 days, then gone
select cron.schedule('jehre-visits-cleanup', '23 3 * * *', $$delete from public.store_visits where at < now() - interval '30 days'$$);
