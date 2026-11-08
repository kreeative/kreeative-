-- Jeere — card payments with Stripe Connect (migration `jeere_card_payments`, project « Jeere », ref aezchxfvzfoqlvzchqyk).
--
-- Each store can connect its own Stripe account (an Express account under Jeere's Stripe platform): the
-- customer pays by card on Stripe's page, the money goes to the store's Stripe account, never to Jeere.
--
--   1. public.store_payments: the store's Stripe account and what Stripe allows it to do. Written only by the
--      `payments` Edge Function (service role); never readable through the API (the function answers).
--   2. public.orders: payment_status ('' | 'en_attente' | 'payee' | 'echouee' | 'remboursee'), paid_at,
--      payment_ref (the Stripe Checkout Session). Written by the function, read by the store's managers.
-- Idempotent.

create table if not exists public.store_payments (
  store_id uuid primary key references public.stores (id) on delete cascade,
  provider text not null default 'stripe' constraint store_payments_provider check (provider in ('stripe')),
  account_id text not null constraint store_payments_account check (account_id ~ '^acct_[A-Za-z0-9]+$'),
  country text not null default '' check (char_length(country) <= 2),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.store_payments is 'Jeere: the Stripe account (Connect Express) of a store, for card payments. Written and read only by the `payments` Edge Function.';
alter table public.store_payments enable row level security;
revoke all on public.store_payments from anon, authenticated;

alter table public.orders add column if not exists payment_status text not null default '';
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists payment_ref text not null default '';
do $$ begin
  alter table public.orders add constraint orders_payment_status_valid
    check (payment_status in ('', 'en_attente', 'payee', 'echouee', 'remboursee'));
exception when duplicate_object then null; end $$;
