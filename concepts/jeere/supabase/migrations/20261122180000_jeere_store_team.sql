-- Applied with the Supabase MCP (jeere_store_team): the owner sees who runs her store with her (public.store_team),
-- and each invitation (public.store_invites) is e-mailed at once by the `relances` function (action 'invite').
alter table public.store_invites add column if not exists notified_at timestamptz;

create or replace function public.store_team(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if public.jeere_store_role(p_store) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', lower(u.email), 'first_name', coalesce(p.first_name, ''), 'role', m.role, 'added_at', m.added_at) order by m.added_at)
    from public.store_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id
    where m.store_id = p_store), '[]'::jsonb);
end $$;
revoke all on function public.store_team(uuid) from public, anon;
grant execute on function public.store_team(uuid) to authenticated;

create or replace function public.jeere_invite_notify()
returns trigger language plpgsql security definer set search_path to '' as $$
declare k text;
begin
  select c.secret into k from public.jeere_cron c where c.id = 1;
  if k is not null and k <> '' then
    perform net.http_post(
      url := 'https://aezchxfvzfoqlvzchqyk.supabase.co/functions/v1/relances',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-jeere-cron', k),
      body := jsonb_build_object('action', 'invite', 'id', new.id));
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.jeere_invite_notify() from public, anon, authenticated;
drop trigger if exists jeere_invite_notify on public.store_invites;
create trigger jeere_invite_notify after insert on public.store_invites for each row execute function public.jeere_invite_notify();
