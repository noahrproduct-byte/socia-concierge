-- Contacts hardening (lib/contacts/server.ts). Run after supabase/contacts.sql
-- and rls-audit.sql. Safe to re-run.
-- 1. The workspace guard on every contacts table, like every other table that
--    carries a workspace_id: a row can only point at a workspace its owner has.
-- 2. Limits on a public sign-up page, the same ones the app applies, so a page
--    written straight through the database can't hold more than the app allows.
--    NOT VALID: they apply to new and changed rows and leave existing ones alone.

do $$
declare t text;
begin
  foreach t in array array['contacts', 'contact_events', 'contact_rules', 'signup_pages'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists socia_guard_workspace_fk on public.%I', t);
      execute format('create trigger socia_guard_workspace_fk before insert or update on public.%I for each row execute function public.socia_guard_workspace_fk()', t);
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'signup_pages_limits' and conrelid = 'public.signup_pages'::regclass) then
    alter table public.signup_pages add constraint signup_pages_limits check (
      slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'
      and char_length(title) between 1 and 80
      and (intro is null or char_length(intro) <= 400)
      and char_length(button) between 1 and 30
      and (tag is null or char_length(tag) <= 40)
    ) not valid;
  end if;
end $$;
