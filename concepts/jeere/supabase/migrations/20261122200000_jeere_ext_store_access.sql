-- Applied with the Supabase MCP (jeere_ext_store_access): who, besides the founder, sees a store that lives on its own
-- site (The Ivory Sukundu, site 'tishe') in her Jehre dashboard. The store itself still decides who may sign in to it
-- (its ADMIN_EMAILS): this table only makes it appear in Jehre. Rows are added by hand.
create table if not exists public.ext_store_access (
  site text not null,
  email text not null check (email = lower(email)),
  added_at timestamptz not null default now(),
  primary key (site, email)
);
alter table public.ext_store_access enable row level security;

create or replace function public.my_ext_stores()
returns text[] language sql stable security definer set search_path to '' as $$
  select coalesce(array_agg(a.site), '{}'::text[]) from public.ext_store_access a where a.email = public.jeere_my_email();
$$;
revoke all on function public.my_ext_stores() from public, anon;
grant execute on function public.my_ext_stores() to authenticated;
