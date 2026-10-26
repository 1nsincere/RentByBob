-- Defense in depth (27 Oct 2026): Supabase's default privileges give anon/authenticated full rights on every NEW
-- table and function in the public schema, so a future migration that forgets its explicit revoke would expose
-- data or an RPC. Remove those defaults for objects created by the migration role. Existing objects already
-- revoke and grant explicitly (verified by tests/database.test.ts and tests/privileges-database.test.ts).
begin;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
-- PostgreSQL also grants EXECUTE on new functions to PUBLIC globally; remove that default for the migration role.
alter default privileges revoke execute on functions from public;

-- Belt and braces for what exists today: no direct writes from browser roles on any public table.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from public, anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

commit;
