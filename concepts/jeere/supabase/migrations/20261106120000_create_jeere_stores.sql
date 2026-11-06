-- Jeere — published stores (migration `create_jeere_stores`, project « Jeere », ref aezchxfvzfoqlvzchqyk).
--
-- One row per store: its public address (slug → https://jeere.kreeative.xyz/b/<slug>), the fiche
-- boutique it renders (the same JSON as the editor's), whether it is online, and its own domain.
--
-- Who can do what (row level security + column privileges):
--   anyone (anon, authenticated)  reads published rows, and only the public columns (never `owner`);
--   the owner (auth.uid())        inserts, updates and deletes her own rows, and reads them unpublished;
--   only the server               writes custom_domain and domain_status (the `domains` Edge Function,
--                                 service role), so nobody can mark a domain « verified » from a browser.
-- The other agent's public.profiles table (id = auth.users.id) is not touched: ownership is auth.users(id).

-- The reserved addresses: Jeere's own paths and the subdomains it may need when stores move to
-- <slug>.jeere.shop. Same list as JeerePublish.RESERVED (creer/publish.js); keep both in step.
create or replace function public.jeere_slug_reserved(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_slug = any (array[
    'www', 'admin', 'api', 'app', 'apps', 'studio', 'creer', 'compte', 'abonnements', 'b', 's', 'p',
    'anim', 'img', 'images', 'assets', 'static', 'cdn', 'media', 'files', 'concepts', 'supabase', 'vercel',
    'jeere', 'kreeative', 'boutique', 'boutiques', 'shop', 'shops', 'store', 'stores', 'magasin',
    'aide', 'help', 'support', 'contact', 'faq', 'blog', 'docs', 'doc', 'status', 'statut',
    'login', 'logout', 'connexion', 'inscription', 'signup', 'signin', 'register', 'auth', 'oauth', 'callback',
    'account', 'compte-pro', 'dashboard', 'tableau-de-bord', 'parametres', 'settings', 'profil', 'profile',
    'panier', 'cart', 'paiement', 'checkout', 'payer', 'pay', 'commande', 'commandes', 'order', 'orders',
    'produit', 'produits', 'product', 'products', 'pages', 'page', 'categorie', 'categories',
    'tarifs', 'pricing', 'prix', 'domaine', 'domaines', 'domain', 'domains', 'abonnement', 'billing', 'facture',
    'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'ns', 'ns1', 'ns2', 'dns', 'mx', 'webmail', 'autoconfig',
    'dev', 'test', 'tests', 'staging', 'preview', 'demo', 'beta', 'sandbox', 'local', 'localhost',
    'root', 'null', 'undefined', 'index', 'new', 'nouveau', 'nouvelle', 'edit', 'modifier',
    'legal', 'cgu', 'cgv', 'mentions-legales', 'confidentialite', 'privacy', 'terms', 'conditions',
    'robots', 'sitemap', 'favicon', 'well-known', 'functions', 'rest', 'storage', 'realtime', 'graphql',
    'webhook', 'webhooks', 'wave', 'orange', 'mtn', 'moov', 'whatsapp'
  ]);
$$;

-- The address rule: 3 to 40 characters, a–z 0–9 and hyphens, no hyphen first, last or doubled.
create or replace function public.jeere_slug_valid(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_slug is not null
     and p_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     and position('--' in p_slug) = 0
     and not public.jeere_slug_reserved(p_slug);
$$;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  -- Nullable while accounts are in demo: rows without an owner can only be written by the team
  -- (service role, SQL editor). A browser always inserts with owner = auth.uid() (the default).
  owner uuid default auth.uid() references auth.users (id) on delete cascade,
  slug text not null unique constraint stores_slug_valid check (public.jeere_slug_valid(slug)),
  fiche jsonb not null default '{}'::jsonb
    constraint stores_fiche_object check (jsonb_typeof(fiche) = 'object')
    constraint stores_fiche_size check (octet_length(fiche::text) <= 1048576),
  -- « Fait avec Jeere » at the bottom of the store. Off only for a paid Studio plan: today the
  -- browser says so (JeerePlans.badgeShown); with real billing a trigger will check the subscription.
  show_badge boolean not null default true,
  published boolean not null default false,
  published_at timestamptz,
  custom_domain text unique
    constraint stores_domain_format check (
      custom_domain is null or (
        custom_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
        and length(custom_domain) between 4 and 253
        and custom_domain !~ '(^|\.)(kreeative\.xyz|vercel\.app|vercel\.com|jeere\.shop|supabase\.co|localhost)$'
      )
    ),
  -- none: no domain · pending: entered, DNS not seen yet · dns_ok: the records point to Vercel ·
  -- waiting_team: the server has no Vercel token yet, the team attaches it by hand · attached: added
  -- to the Vercel project, waiting for its checks · verified: live with https · error: Vercel refused it
  domain_status text not null default 'none'
    constraint stores_domain_status check (domain_status in ('none', 'pending', 'dns_ok', 'waiting_team', 'attached', 'verified', 'error')),
  domain_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stores is 'Jeere stores: public address (slug), fiche boutique (jsonb, 1 MB max), published flag, custom domain. Anyone reads published rows; only the owner writes; only the domains Edge Function writes the domain columns.';

create index stores_owner_idx on public.stores (owner);
create index stores_published_slug_idx on public.stores (slug) where published;

-- published_at follows the switch, updated_at every change, the owner never changes, and a person
-- has 10 stores at most (Agence plans included).
create or replace function public.jeere_stores_touch()
returns trigger
language plpgsql
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
    new.owner := old.owner;
    new.created_at := old.created_at;
    if new.published and not old.published then new.published_at := now();
    elsif new.published then new.published_at := coalesce(old.published_at, now());
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger stores_touch
before insert or update on public.stores
for each row execute function public.jeere_stores_touch();

alter table public.stores enable row level security;

create policy "Anyone reads published stores"
on public.stores for select
to anon, authenticated
using (published);

create policy "Owners read their stores"
on public.stores for select
to authenticated
using (owner = (select auth.uid()));

create policy "Owners create their stores"
on public.stores for insert
to authenticated
with check (owner = (select auth.uid()));

create policy "Owners update their stores"
on public.stores for update
to authenticated
using (owner = (select auth.uid()))
with check (owner = (select auth.uid()));

create policy "Owners delete their stores"
on public.stores for delete
to authenticated
using (owner = (select auth.uid()));

-- Column privileges: the public never sees `owner`; browsers never write the domain columns.
revoke all on public.stores from anon, authenticated;
grant select (id, slug, fiche, show_badge, published, published_at, custom_domain, domain_status, updated_at)
  on public.stores to anon, authenticated;
grant insert (slug, fiche, show_badge, published) on public.stores to authenticated;
grant update (slug, fiche, show_badge, published) on public.stores to authenticated;
grant delete on public.stores to authenticated;

-- Is this address free? { available, reason: ok | format | reserved | taken | yours }.
-- Security definer so that a slug taken by an unpublished store reads « taken » too.
create or replace function public.slug_available(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s text := lower(coalesce(p_slug, ''));
  who uuid;
begin
  if public.jeere_slug_reserved(s) then
    return jsonb_build_object('available', false, 'reason', 'reserved');
  end if;
  if not public.jeere_slug_valid(s) then
    return jsonb_build_object('available', false, 'reason', 'format');
  end if;
  select owner into who from public.stores where slug = s;
  if not found then
    return jsonb_build_object('available', true, 'reason', 'ok');
  end if;
  if who is not null and who = auth.uid() then
    return jsonb_build_object('available', true, 'reason', 'yours');
  end if;
  return jsonb_build_object('available', false, 'reason', 'taken');
end;
$$;

revoke all on function public.slug_available(text) from public;
grant execute on function public.slug_available(text) to anon, authenticated;

-- The signed-in person's stores (without the heavy fiche), newest first.
create or replace function public.my_stores()
returns table (id uuid, slug text, published boolean, published_at timestamptz, show_badge boolean,
               custom_domain text, domain_status text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.slug, s.published, s.published_at, s.show_badge, s.custom_domain, s.domain_status, s.updated_at
  from public.stores s
  where s.owner = auth.uid()
  order by s.updated_at desc;
$$;

revoke all on function public.my_stores() from public, anon;
grant execute on function public.my_stores() to authenticated;

revoke all on function public.jeere_stores_touch() from public, anon, authenticated;
