-- Jeere : un abonnement = une boutique. Le plan passe du compte à la boutique (écrit par le serveur seulement).
alter table public.stores add column if not exists plan text not null default 'gratuit';
alter table public.stores add column if not exists plan_until timestamptz;
alter table public.stores add column if not exists plan_promo text;
alter table public.stores drop constraint if exists stores_plan_check;
alter table public.stores add constraint stores_plan_check check (plan in ('gratuit', 'essentiel', 'pro', 'business'));
revoke update (plan, plan_until, plan_promo) on public.stores from anon, authenticated;
revoke insert (plan, plan_until, plan_promo) on public.stores from anon, authenticated;

-- les boutiques qui existent gardent le plan de leur propriétaire (rien ne casse)
update public.stores s set plan = coalesce(p.plan, 'gratuit'), plan_until = p.plan_until, plan_promo = p.plan_promo
  from public.profiles p where p.id = s.owner and coalesce(p.plan, 'gratuit') in ('gratuit', 'essentiel', 'pro', 'business');

-- l'offre de lancement : donnée à la 1re boutique d'un compte confirmé après le début de l'offre
drop trigger if exists on_auth_user_confirmed on auth.users;
create or replace function private.grant_launch_store()
 returns trigger language plpgsql security definer set search_path to '' as $f$
declare o public.launch_offer; taken int; m int; promo text; confirmed timestamptz;
begin
  if new.owner is null or new.plan <> 'gratuit' then return new; end if;
  select * into o from public.launch_offer where id = 1;
  if o is null or not o.active then return new; end if;
  select u.confirmed_at into confirmed from auth.users u where u.id = new.owner;
  if confirmed is null or confirmed < o.starts_at then return new; end if;
  if exists (select 1 from public.stores s where s.owner = new.owner and s.id <> new.id) then return new; end if;
  perform pg_advisory_xact_lock(hashtext('jeere_launch_offer'));
  select count(*) into taken from public.stores where plan_promo like 'lancement%';
  if taken < o.spots then m := o.months; promo := 'lancement';
  elsif o.trial_months > 0 then m := o.trial_months; promo := 'essai';
  else return new; end if;
  update public.stores set plan = 'essentiel', plan_until = now() + make_interval(months => m), plan_promo = promo where id = new.id;
  return new;
end $f$;
drop trigger if exists stores_launch on public.stores;
create trigger stores_launch after insert on public.stores for each row execute function private.grant_launch_store();

create or replace function private.expire_launch()
 returns int language sql security definer set search_path to '' as $f$
  with x as (update public.stores set plan = 'gratuit', plan_until = null, plan_promo = plan_promo || '-fini'
     where plan_promo in ('lancement', 'essai') and plan_until < now() and plan = 'essentiel' returning 1)
  select count(*)::int from x
$f$;

create or replace function public.launch_spots()
 returns jsonb language sql stable security definer set search_path to '' as $f$
  with t as (select count(*)::int n from public.stores where plan_promo like 'lancement%')
  select jsonb_build_object(
    'active', o.active and t.n < o.spots,
    'trial', o.active and o.trial_months > 0, 'trialMonths', o.trial_months,
    'spots', o.spots, 'months', o.months, 'hideFree', o.hide_free,
    'taken', t.n, 'left', greatest(0, o.spots - t.n))
  from public.launch_offer o, t where o.id = 1
$f$;
revoke all on function public.launch_spots() from public;
grant execute on function public.launch_spots() to anon, authenticated;

-- le badge « Fait avec Jeere » : obligatoire sauf si CETTE boutique est sur un plan payant, ou Studio débloqué
create or replace function public.jeere_stores_badge()
 returns trigger language plpgsql security definer set search_path to '' as $f$
begin
  if new.show_badge = false and new.owner is not null and coalesce(new.plan, 'gratuit') = 'gratuit' and public.jeere_badge_required(new.owner) then
    new.show_badge := true;
  end if;
  return new;
end $f$;

-- Applied with the Supabase MCP in four parts (jeere_plan_per_store_1..4); also:
grant select (plan, plan_until, plan_promo) on public.stores to authenticated;
