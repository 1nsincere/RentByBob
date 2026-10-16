-- Access foundation only. Apply through versioned migrations to an authorized environment.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.staff_memberships (
  property_id uuid not null references public.properties(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'clerk')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (property_id, user_id)
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  kind text not null check (kind in ('individual', 'business')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (property_id, id)
);

create table public.tenant_contacts (
  property_id uuid not null,
  tenant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  foreign key (property_id, tenant_id) references public.tenants(property_id, id) on delete restrict
);
create index tenant_contacts_user_idx on public.tenant_contacts(user_id, tenant_id) where revoked_at is null;
create index staff_memberships_user_idx on public.staff_memberships(user_id, property_id) where revoked_at is null;
create index tenants_property_idx on public.tenants(property_id);

create table public.audit_events (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_id uuid not null,
  tenant_id uuid references public.tenants(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  occurred_at timestamptz not null default now()
);
create index audit_events_property_idx on public.audit_events(property_id, occurred_at);

-- The tenant role is a current contact relationship, not editable auth metadata.
-- Helpers use the caller's identity, never a supplied user ID. No private schema in Data API.
create function private.staff_role(p_property_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.staff_memberships m
  where m.property_id = p_property_id and m.user_id = (select auth.uid())
    and m.revoked_at is null and (select auth.jwt()->>'aal') = 'aal2'
$$;

create function private.can_read_tenant(p_tenant_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenants t
    where t.id = p_tenant_id and (
      private.staff_role(t.property_id) is not null
      or (t.archived_at is null and exists (
        select 1 from public.tenant_contacts c
        where c.tenant_id = t.id and c.user_id = (select auth.uid()) and c.revoked_at is null
      ))
    )
  )
$$;

alter table public.properties enable row level security;
alter table public.staff_memberships enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_contacts enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.properties, public.staff_memberships, public.tenants,
  public.tenant_contacts, public.audit_events from public, anon, authenticated;
grant select on public.properties, public.staff_memberships, public.tenants,
  public.tenant_contacts, public.audit_events to authenticated;
revoke all on sequence public.audit_events_id_seq from public, anon, authenticated;

create policy properties_read on public.properties for select to authenticated
  using (private.staff_role(id) is not null);
create policy staff_read on public.staff_memberships for select to authenticated
  using (private.staff_role(property_id) = 'owner'
    or (user_id = (select auth.uid()) and private.staff_role(property_id) is not null));
create policy tenants_read on public.tenants for select to authenticated
  using (private.can_read_tenant(id));
create policy contacts_read on public.tenant_contacts for select to authenticated
  using (private.staff_role(property_id) is not null
    or (user_id = (select auth.uid()) and revoked_at is null and private.can_read_tenant(tenant_id)));
create policy audit_read on public.audit_events for select to authenticated
  using (private.staff_role(property_id) = 'owner');

-- No INSERT/UPDATE/DELETE policies or grants for browser roles.
-- Every mutation checks current membership and MFA inside its transaction.
create function public.create_tenant(
  p_property_id uuid, p_tenant_id uuid, p_display_name text, p_kind text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare existing public.tenants;
begin
  -- Shared property lock serializes access changes with property mutations.
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_tenant_id is null then raise exception 'A request identifier is required' using errcode = '22023'; end if;
  select * into existing from public.tenants where id = p_tenant_id;
  if found then
    if existing.property_id = p_property_id and existing.display_name = btrim(p_display_name)
      and existing.kind = p_kind and existing.archived_at is null then return existing.id; end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;
  insert into public.tenants(id, property_id, display_name, kind)
    values (p_tenant_id, p_property_id, btrim(p_display_name), p_kind);
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (p_property_id, auth.uid(), 'tenant_created', p_tenant_id, p_tenant_id, 'Tenant record created');
  return p_tenant_id;
end $$;

create function public.set_tenant_contact(
  p_tenant_id uuid, p_user_id uuid, p_enabled boolean, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.tenants;
begin
  select * into target from public.tenants where id = p_tenant_id;
  perform 1 from public.properties where id = target.property_id for update;
  if private.staff_role(target.property_id) is distinct from 'owner' then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select * into target from public.tenants where id = p_tenant_id for update;
  if target.archived_at is not null or p_enabled is null then
    raise exception 'Cannot change contact access for this record' using errcode = '22023';
  end if;
  insert into public.tenant_contacts(property_id, tenant_id, user_id, revoked_at)
    values (target.property_id, target.id, p_user_id, case when p_enabled then null else now() end)
    on conflict (tenant_id, user_id) do update set revoked_at = excluded.revoked_at;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (target.property_id, auth.uid(), case when p_enabled then 'contact_enabled' else 'contact_revoked' end, p_user_id, target.id, p_reason);
end $$;

create function public.set_staff_access(
  p_property_id uuid, p_user_id uuid, p_role text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is distinct from 'owner' then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('owner', 'clerk') then
    raise exception 'Invalid staff role' using errcode = '22023';
  end if;
  if p_role is distinct from 'owner' and exists (
    select 1 from public.staff_memberships where property_id = p_property_id
      and user_id = p_user_id and role = 'owner' and revoked_at is null
  ) and not exists (
    select 1 from public.staff_memberships where property_id = p_property_id
      and user_id <> p_user_id and role = 'owner' and revoked_at is null
  ) then raise exception 'Keep at least one active owner' using errcode = '23514'; end if;
  if p_role is null then
    update public.staff_memberships set revoked_at = now() where property_id = p_property_id and user_id = p_user_id;
  else
    insert into public.staff_memberships(property_id, user_id, role)
      values (p_property_id, p_user_id, p_role)
      on conflict (property_id, user_id) do update set role = excluded.role, revoked_at = null;
  end if;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), case when p_role is null then 'staff_revoked' else 'staff_role_' || p_role end, p_user_id, p_reason);
end $$;

-- Foundation archival: not a move-out/settlement procedure. Extend with agreement
-- lifecycle checks before any agreements or financial records are introduced.
create function public.archive_tenant(p_tenant_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.tenants;
begin
  select * into target from public.tenants where id = p_tenant_id;
  perform 1 from public.properties where id = target.property_id for update;
  if private.staff_role(target.property_id) is distinct from 'owner' then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select * into target from public.tenants where id = p_tenant_id for update;
  if target.archived_at is not null then return; end if;
  update public.tenants set archived_at = now() where id = target.id;
  update public.tenant_contacts set revoked_at = now() where tenant_id = target.id and revoked_at is null;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (target.property_id, auth.uid(), 'tenant_archived', target.id, target.id, p_reason);
end $$;

revoke all on function private.staff_role(uuid), private.can_read_tenant(uuid) from public, anon, authenticated;
grant execute on function private.staff_role(uuid), private.can_read_tenant(uuid) to authenticated;
revoke all on function public.create_tenant(uuid, uuid, text, text), public.set_tenant_contact(uuid, uuid, boolean, text),
  public.set_staff_access(uuid, uuid, text, text), public.archive_tenant(uuid, text) from public, anon, authenticated;
grant execute on function public.create_tenant(uuid, uuid, text, text), public.set_tenant_contact(uuid, uuid, boolean, text),
  public.set_staff_access(uuid, uuid, text, text), public.archive_tenant(uuid, text) to authenticated;

commit;
