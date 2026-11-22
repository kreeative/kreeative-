-- Applied with the Supabase MCP (jeere_signup_welcomes): one welcome e-mail per new account, sent by the `relances`
-- function once the e-mail is confirmed. Accounts confirmed before this migration do not receive it.
create table if not exists public.signup_welcomes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now(),
  ok boolean not null default false
);
alter table public.signup_welcomes enable row level security;

create or replace function public.pending_welcomes()
returns table(id uuid, email text, first_name text)
language sql stable security definer set search_path to '' as $$
  select u.id, u.email::text, coalesce(p.first_name, '')
  from auth.users u left join public.profiles p on p.id = u.id
  where u.confirmed_at is not null
    and coalesce(u.email, '') <> ''
    and u.confirmed_at > timestamptz '2026-11-22 18:50:00+00'
    and u.confirmed_at > now() - interval '3 days'
    and split_part(lower(u.email), '@', 2) not in ('mailinator.com', 'example.com', 'yopmail.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com')
    and not exists (select 1 from public.signup_welcomes w where w.user_id = u.id)
  limit 200
$$;
revoke all on function public.pending_welcomes() from public, anon, authenticated;
grant execute on function public.pending_welcomes() to service_role;
