-- Applied with the Supabase MCP (jeere_design_requests_ip): design_requests.ip_hash (a SHA-256 of the sender's IP, never
-- the IP), for the per-connection limit of the `appel` function.
alter table public.design_requests add column if not exists ip_hash text;
