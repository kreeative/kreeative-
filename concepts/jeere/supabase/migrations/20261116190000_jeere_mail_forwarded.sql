-- The messages received on @jehre.com that the function `mailforward` has already passed on to the team's mailbox:
-- each one goes through once. Only the service key reads or writes it.
create table if not exists public.jeere_mail_forwarded (
  id text primary key,
  at timestamptz not null default now()
);
alter table public.jeere_mail_forwarded enable row level security;
revoke all on public.jeere_mail_forwarded from anon, authenticated;
