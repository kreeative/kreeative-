-- Applied with the Supabase MCP (jeere_sources_stats, jeere_stats_distinct): profiles.source (?ref=… at signup,
-- set by private.handle_new_user from raw_user_meta_data.ref) and public.jeere_stats(p_days), the founder's counter
-- (site_editors only). See the live definitions in the database.
alter table public.profiles add column if not exists source text;
