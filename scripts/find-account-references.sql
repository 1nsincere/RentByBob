-- READ ONLY. Shows every record that still points to one sign-in account, so you can see why Supabase will not delete
-- it. Run in Supabase > SQL Editor. Change only the email on the line marked CHANGE. Nothing is modified.
create temp table if not exists account_refs(table_name text, column_name text, rows bigint);
truncate account_refs;

do $$
declare
  v_email text := 'PUT-THE-TEST-EMAIL-HERE@gmail.com';   -- CHANGE
  v_account uuid;
  link record;
  found_rows bigint;
begin
  select id into v_account from auth.users where lower(email) = lower(btrim(v_email));
  if v_account is null then raise exception 'No account uses the email %', v_email; end if;

  for link in
    select con.conrelid::regclass::text as table_name, att.attname as column_name
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.contype = 'f' and con.confrelid = 'auth.users'::regclass
      and con.connamespace not in ('auth'::regnamespace)
  loop
    execute format('select count(*) from %s where %I = $1', link.table_name, link.column_name) into found_rows using v_account;
    if found_rows > 0 then insert into account_refs values (link.table_name, link.column_name, found_rows); end if;
  end loop;

  select count(*) into found_rows from private.invitation_attempts where recipient_email = lower(btrim(v_email));
  if found_rows > 0 then insert into account_refs values ('private.invitation_attempts', 'recipient_email', found_rows); end if;
end $$;

select * from account_refs order by table_name, column_name;
