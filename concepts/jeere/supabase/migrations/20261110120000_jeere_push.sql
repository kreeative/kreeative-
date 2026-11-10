-- Jeere : notifications push (téléphone et ordinateur des vendeuses)
-- Les appareils inscrits, et les clés de signature (créées par la fonction `push`, jamais lues par le navigateur).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_config (
  id int primary key check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);

-- RLS on, no policy: only the server (service role) reads or writes them
alter table public.push_subscriptions enable row level security;
alter table public.push_config enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.push_config from anon, authenticated;
