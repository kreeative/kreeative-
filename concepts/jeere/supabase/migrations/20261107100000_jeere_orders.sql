-- Jeere — orders and order e-mails (migration `jeere_orders`, project « Jeere », ref aezchxfvzfoqlvzchqyk).
--
--   1. public.orders: every order placed on a Jeere store (its own page or a custom site linked with Jeere
--      Connect). Written only by the `orders` Edge Function (service role), which recomputes the prices from
--      the published fiche; read and updated (status, note) by the people who manage the store.
--   2. stores.notifications: the store's e-mail templates (like Shopify's notifications), edited from the
--      dashboard: { confirmation, nouvelle, expediee, livree, annulee: { on, subject, body } }. Empty = the
--      defaults written in the function.
--   3. stores.contact_email (where the shop gets its « Nouvelle commande » e-mails; empty = the owner's
--      address) and stores.order_seq (order numbers #1001, #1002…, per store).
-- Idempotent; works whether or not the client-projects migration (store_members) is applied.

alter table public.stores add column if not exists notifications jsonb not null default '{}'::jsonb;
alter table public.stores add column if not exists contact_email text;
alter table public.stores add column if not exists order_seq integer not null default 1000;
do $$ begin
  alter table public.stores add constraint stores_notifications_object
    check (jsonb_typeof(notifications) = 'object' and octet_length(notifications::text) <= 65536);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.stores add constraint stores_contact_email_valid
    check (contact_email is null or (contact_email = lower(contact_email) and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(contact_email) <= 254));
exception when duplicate_object then null; end $$;

-- Who manages a store: its owner, or (once the client-projects migration is in) one of its members.
create or replace function public.jeere_can_manage(p_store uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare r boolean := false;
begin
  if (select auth.uid()) is null then return false; end if;
  if exists (select 1 from public.stores s where s.id = p_store and s.owner = (select auth.uid())) then return true; end if;
  if to_regclass('public.store_members') is not null then
    execute 'select exists (select 1 from public.store_members m where m.store_id = $1 and m.user_id = $2)'
      into r using p_store, (select auth.uid());
  end if;
  return coalesce(r, false);
end;
$$;
revoke all on function public.jeere_can_manage(uuid) from public, anon;
grant execute on function public.jeere_can_manage(uuid) to authenticated;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  number integer not null,
  status text not null default 'nouvelle'
    constraint orders_status_valid check (status in ('nouvelle', 'confirmee', 'preparee', 'expediee', 'livree', 'annulee')),
  customer jsonb not null default '{}'::jsonb constraint orders_customer_object check (jsonb_typeof(customer) = 'object'),
  lines jsonb not null default '[]'::jsonb constraint orders_lines_array check (jsonb_typeof(lines) = 'array'),
  subtotal integer not null default 0 check (subtotal >= 0),
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  total integer not null default 0 check (total >= 0),
  currency text not null default 'XOF',
  payment text not null default '',
  note text not null default '' check (length(note) <= 2000),
  source text not null default 'boutique',
  emails jsonb not null default '[]'::jsonb,          -- what was sent: [{ kind, to, at, ok }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_number_unique unique (store_id, number)
);
comment on table public.orders is 'Jeere: orders of the stores. Inserted only by the `orders` Edge Function (prices recomputed from the published fiche); read and updated (status, note) by those who manage the store.';
create index if not exists orders_store_idx on public.orders (store_id, created_at desc);

alter table public.orders enable row level security;
drop policy if exists "Managers read their orders" on public.orders;
create policy "Managers read their orders" on public.orders for select to authenticated
  using (public.jeere_can_manage(store_id));
drop policy if exists "Managers update their orders" on public.orders;
create policy "Managers update their orders" on public.orders for update to authenticated
  using (public.jeere_can_manage(store_id)) with check (public.jeere_can_manage(store_id));
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;
grant update (status, note, updated_at) on public.orders to authenticated;

-- The next order number of a store, atomically (#1001, #1002…)
create or replace function public.jeere_next_order_number(p_store uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.stores set order_seq = order_seq + 1 where id = p_store returning order_seq;
$$;
revoke all on function public.jeere_next_order_number(uuid) from public, anon, authenticated;
grant execute on function public.jeere_next_order_number(uuid) to service_role;
