-- Applied with the Supabase MCP (jeere_store_model_choice): a seller who bought several designer models chooses the
-- one her store shows (store.model in her fiche). public.store_model answers that one if she bought it, else the
-- latest model she bought: a model she did not pay for is never served, whatever her fiche says.
create or replace function public.store_model(p_slug text)
returns text language sql stable security definer set search_path to '' as $$
  select m.model from public.model_purchases m join public.stores s on s.owner = m.user_id
  where s.slug = lower(p_slug) and s.published and (m.store_id is null or m.store_id = s.id)
  order by (m.model = (s.fiche -> 'store' ->> 'model')) desc, m.created_at desc limit 1;
$$;
revoke all on function public.store_model(text) from public;
grant execute on function public.store_model(text) to anon, authenticated;
