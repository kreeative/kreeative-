-- Jeere — appointments (migration `jeere_bookings`, project « Jeere », ref aezchxfvzfoqlvzchqyk).
--
-- Service businesses (lashes, nails, hair, braids, make-up…) take bookings with Jeere, the way a shop takes orders.
--
--   1. public.booking_settings: one row per store that takes appointments. `settings` holds her services, add-ons,
--      team, opening hours, booking rules (slot step, notice, buffer, deposit) and policies; `seq` numbers her
--      appointments (#101, #102…).
--   2. public.appointments: every booking. An exclusion constraint makes a double booking impossible: two live
--      appointments of the same person of the same store can never overlap, even when two clients press
--      « Réserver » at the same second. `busy_until` = the end plus the buffer she asked between two clients.
--   3. public.booking_blocks: time she closes (a day off, a lunch, a holiday), for one person or for everyone.
--
-- All three are written and read ONLY by the `bookings` Edge Function (service role): row level security is on with
-- no policy and no API privilege, like store_payments. The function checks who manages the store.
-- Idempotent.

create extension if not exists btree_gist with schema extensions;

create table if not exists public.booking_settings (
  store_id uuid primary key references public.stores (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb
    constraint booking_settings_object check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 262144),
  seq integer not null default 100,
  updated_at timestamptz not null default now()
);
comment on table public.booking_settings is 'Jeere: a store''s appointment settings (services, add-ons, team, hours, rules, policies) and its appointment counter. Server only (the `bookings` Edge Function).';

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  number integer not null,
  status text not null default 'confirme'
    constraint appointments_status_valid check (status in ('en_attente', 'confirme', 'termine', 'absent', 'annule')),
  staff_id text not null default 'e1' constraint appointments_staff_valid check (staff_id ~ '^[a-z0-9_-]{1,24}$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  busy_until timestamptz not null,
  service jsonb not null default '{}'::jsonb constraint appointments_service_object check (jsonb_typeof(service) = 'object'),
  customer jsonb not null default '{}'::jsonb constraint appointments_customer_object check (jsonb_typeof(customer) = 'object'),
  total integer not null default 0 check (total >= 0),
  deposit integer not null default 0 check (deposit >= 0),
  deposit_status text not null default ''
    constraint appointments_deposit_valid check (deposit_status in ('', 'en_attente', 'recu', 'rembourse', 'garde')),
  payment text not null default '',
  currency text not null default 'XOF',
  note text not null default '' check (length(note) <= 2000),   -- what the client wrote
  memo text not null default '' check (length(memo) <= 2000),   -- the shop's private note
  source text not null default 'site',                          -- site | jeere | manuel
  manage_url text not null default '' check (length(manage_url) <= 400),
  token text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  emails jsonb not null default '[]'::jsonb,                    -- what was sent: [{ kind, to, at, ok }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_number_unique unique (store_id, number),
  constraint appointments_token_unique unique (token),
  constraint appointments_times check (ends_at > starts_at and busy_until >= ends_at),
  constraint appointments_no_overlap exclude using gist (
    store_id with =, staff_id with =, tstzrange(starts_at, busy_until, '[)') with &&
  ) where (status <> 'annule')
);
comment on table public.appointments is 'Jeere: appointments of the stores. Written and read only by the `bookings` Edge Function. No two live appointments of one person of one store can overlap (exclusion constraint).';
create index if not exists appointments_store_idx on public.appointments (store_id, starts_at);

create table if not exists public.booking_blocks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  staff_id text not null default '' constraint booking_blocks_staff_valid check (staff_id ~ '^[a-z0-9_-]{0,24}$'),  -- '' = everyone
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '' check (length(reason) <= 120),
  created_at timestamptz not null default now(),
  constraint booking_blocks_times check (ends_at > starts_at)
);
comment on table public.booking_blocks is 'Jeere: time a store closes to bookings (day off, break, holiday), for one person (staff_id) or everyone (''''). Server only.';
create index if not exists booking_blocks_store_idx on public.booking_blocks (store_id, starts_at);

alter table public.booking_settings enable row level security;
alter table public.appointments enable row level security;
alter table public.booking_blocks enable row level security;
revoke all on public.booking_settings, public.appointments, public.booking_blocks from anon, authenticated;

-- The next appointment number of a store, atomically (#101, #102…); creates her settings row if she has none
create or replace function public.jeere_next_booking_number(p_store uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.booking_settings (store_id, seq) values (p_store, 101)
  on conflict (store_id) do update set seq = public.booking_settings.seq + 1
  returning seq;
$$;
revoke all on function public.jeere_next_booking_number(uuid) from public, anon, authenticated;

-- The reminder e-mail, the day before: every hour, the `bookings` function looks for confirmed appointments 2 to 26
-- hours away that have not been reminded yet (same secret header as the « jeere-relances » job).
do $$ begin
  if exists (select 1 from cron.job where jobname = 'jeere-rdv-rappels') then perform cron.unschedule('jeere-rdv-rappels'); end if;
  perform cron.schedule('jeere-rdv-rappels', '41 * * * *', $c$
    select net.http_post(
      url := 'https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/bookings',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-jeere-cron', (select secret from public.jeere_cron where id = 1)),
      body := '{"action":"remind"}'::jsonb)
  $c$);
end $$;
