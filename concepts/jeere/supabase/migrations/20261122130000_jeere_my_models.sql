-- Applied with the Supabase MCP (jeere_my_models): public.my_models(), the designer models the signed-in account
-- bought (model, with or without the installation, installed or not), newest first. Her dashboard shows the model
-- as soon as it is paid. Security definer over public.model_purchases, her own rows only (auth.uid()); not callable
-- by the anonymous role.
create or replace function public.my_models()
returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('model', m.model, 'install', m.install, 'amount', m.amount, 'installed_at', m.installed_at, 'store_id', m.store_id, 'at', m.created_at) order by m.created_at desc), '[]'::jsonb)
  from public.model_purchases m where m.user_id = auth.uid();
$$;
revoke all on function public.my_models() from public, anon;
grant execute on function public.my_models() to authenticated;
