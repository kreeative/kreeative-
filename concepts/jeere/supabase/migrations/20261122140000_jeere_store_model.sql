-- Applied with the Supabase MCP (jeere_store_model): public.store_model(p_slug), the designer model a published store
-- shows: the latest model its owner bought for it (or for no store in particular). Read by api/store.js, which then
-- serves that model's page on her address with her store in it. Answers only the model's short name.
create or replace function public.store_model(p_slug text)
returns text language sql stable security definer set search_path to '' as $$
  select m.model from public.model_purchases m join public.stores s on s.owner = m.user_id
  where s.slug = lower(p_slug) and s.published and (m.store_id is null or m.store_id = s.id)
  order by m.created_at desc limit 1;
$$;
revoke all on function public.store_model(text) from public;
grant execute on function public.store_model(text) to anon, authenticated;
