-- Applied with the Supabase MCP (jeere_launch_trial_everyone): launch_offer.trial_months (1). Everyone confirmed
-- after starts_at gets Essentiel free for trial_months (plan_promo 'essai'); the first `spots` (10) get `months` (3)
-- (plan_promo 'lancement'). private.expire_launch ends both. public.launch_spots() also returns trial, trialMonths.
alter table public.launch_offer add column if not exists trial_months int not null default 1;
