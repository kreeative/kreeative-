-- Jeere — who may edit and publish the kreeative websites from the Studio's « Mes sites »
-- (migration `create_site_editors`, project « Jeere », ref aezchxfvzfoqlvzchqyk).
--
-- A tiny allow-list read by the `sites-publish` Edge Function only (with the service role).
-- Row level security is on and there is NO policy, and the API roles have no privilege at all:
-- nobody can read, list or change it with the publishable key or a user session. To add a
-- person, insert her e-mail from the SQL editor (lower case):
--   insert into public.site_editors (email, note) values ('someone@example.com', 'why');

create table if not exists public.site_editors (
  email      text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note       text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.site_editors is
  'Who may publish the kreeative websites from Jeere Studio « Mes sites » (sites-publish Edge Function). RLS on, no policy, no API privilege: server only.';

alter table public.site_editors enable row level security;

revoke all on table public.site_editors from anon, authenticated;
revoke all on table public.site_editors from public;
grant select on table public.site_editors to service_role;

insert into public.site_editors (email, note)
values ('annklyy@gmail.com', 'Anne-Kelly Kouyate, fondatrice (kreeative)')
on conflict (email) do nothing;
