-- Applied with the Supabase MCP (jeere_session_handoffs): the one-time passes of the `handoff` function (Safari -> the app
-- on the home screen); only their SHA-256 is kept.
create table if not exists public.session_handoffs (code_hash text primary key, user_id uuid not null references auth.users (id) on delete cascade, created_at timestamptz not null default now(), expires_at timestamptz not null, used_at timestamptz);
alter table public.session_handoffs enable row level security;
revoke all on public.session_handoffs from anon, authenticated;
