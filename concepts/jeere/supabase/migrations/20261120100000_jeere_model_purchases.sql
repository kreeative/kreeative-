-- Applied with the Supabase MCP (jeere_model_purchases): a designer model paid by card (the `billing` function,
-- on Stripe's checkout.session.completed). Written and read by the service role only: row level security is on
-- with no policy. See them: select * from public.model_purchases order by created_at desc;
create table if not exists public.model_purchases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  store_id uuid references public.stores (id) on delete set null,
  model text not null,
  amount integer not null default 0,
  email text not null default '',
  phone text not null default '',
  shop_name text not null default '',
  sells text not null default '',
  installed_at timestamptz
);
alter table public.model_purchases enable row level security;
revoke all on public.model_purchases from anon, authenticated;
create index if not exists model_purchases_user_idx on public.model_purchases (user_id);
