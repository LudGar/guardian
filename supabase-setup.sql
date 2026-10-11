-- Run once in Supabase → SQL Editor.
create table if not exists public.guardians (
  membership_id   text primary key,
  membership_type int  not null,
  display_name    text,
  card_no         bigint unique not null,
  first_seen      timestamptz not null default now()
);

-- No direct table access for visitors; everything goes through the function below.
alter table public.guardians enable row level security;

create or replace function public.register_guardian(p_id text, p_type int, p_name text)
returns table(card_no bigint, total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  if p_id !~ '^[0-9]{10,20}$' or p_type not in (1, 2, 3, 5, 6) then
    raise exception 'invalid guardian';
  end if;
  select g.card_no into n from guardians g where g.membership_id = p_id;
  if n is null then
    lock table guardians in share row exclusive mode;   -- gap-free, race-safe numbering
    select g.card_no into n from guardians g where g.membership_id = p_id;
    if n is null then
      select coalesce(max(g.card_no), 0) + 1 into n from guardians g;
      insert into guardians (membership_id, membership_type, display_name, card_no)
      values (p_id, p_type, left(coalesce(p_name, ''), 64), n);
    end if;
  end if;
  return query select n, (select count(*) from guardians)::bigint;
end;
$$;

revoke all on function public.register_guardian(text, int, text) from public;
grant execute on function public.register_guardian(text, int, text) to anon;

-- ---- Shared plaque edits (written only by the save-guardian Edge Function) ----
create table if not exists public.guardian_edits (
  membership_id text primary key,
  data          jsonb not null,
  updated_at    timestamptz not null default now()
);
alter table public.guardian_edits enable row level security;
drop policy if exists "public read" on public.guardian_edits;
create policy "public read" on public.guardian_edits for select to anon using (true);
