-- Applied with the Supabase MCP (jeere_model_purchases_install): the installation by the team is an option paid on
-- top of a designer model (50 000 FCFA, the `billing` function). install = she paid for it.
alter table public.model_purchases add column if not exists install boolean not null default false;
