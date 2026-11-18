-- ============================================================================
-- HarvestFlow Version 1 - Hardened Supabase PostgreSQL Migration
-- Single Source of Truth (Supabase PostgreSQL ONLY)
-- Roles: admin, commercial, farm_coordinator, transport, warehouse, viewer
--
-- Security & Reliability Guarantees:
--  1. New signups ALWAYS receive safe default role 'viewer' (never from signup metadata).
--  2. Every SECURITY DEFINER function sets search_path = pg_catalog, public,
--     revokes PUBLIC/anon EXECUTE, and verifies active user status & role.
--  3. Department-wide notifications track per-user read state in notification_reads.
--  4. Normal harvest progress moves forward; downward corrections require the
--     dedicated authorized rpc_correct_farm_progress operation (never reopening 100%).
--  5. Reminders only apply after explicit harvest start; scheduling is configured
--     separately in production (this migration defines the function only).
--  6. Realtime publication verifies every required table without swallowing errors.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum (
    'admin',
    'commercial',
    'farm_coordinator',
    'transport',
    'warehouse',
    'viewer'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_priority as enum ('normal', 'urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum (
    'pending_allocation',
    'allocated',
    'in_progress',
    'completed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.harvest_status as enum ('pending', 'in_progress', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_severity as enum ('info', 'warning', 'urgent', 'success');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null,
  role public.user_role not null default 'viewer',
  preferred_language text not null default 'fr' check (preferred_language in ('fr', 'es')),
  is_active boolean not null default true,
  password_updated_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  code text check (code is null or length(trim(code)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.harvest_progress_steps (
  id uuid primary key default gen_random_uuid(),
  percentage smallint not null unique check (percentage between 1 and 100),
  is_completion boolean generated always as (percentage = 100) stored,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  singleton boolean primary key default true check (singleton),
  harvest_reminder_interval_minutes integer not null default 60
    check (harvest_reminder_interval_minutes between 5 and 1440),
  transport_prep_alert_threshold_pct smallint not null default 70
    check (transport_prep_alert_threshold_pct between 1 and 99),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.order_ref_seq start 101;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('CMD-' || nextval('public.order_ref_seq')::text),
  product text not null check (length(trim(product)) > 0),
  quantity_kg integer not null check (quantity_kg > 0),
  priority public.order_priority not null default 'normal',
  notes text,
  status public.order_status not null default 'pending_allocation',
  created_by uuid not null references public.profiles(id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  allocated_at timestamptz,
  harvest_started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.farm_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  farm_id uuid not null references public.farms(id) on delete restrict,
  farm_name_snapshot text not null,
  allocated_qty_kg integer not null check (allocated_qty_kg > 0),
  harvest_status public.harvest_status not null default 'pending',
  current_progress_pct smallint not null default 0 check (current_progress_pct between 0 and 100),
  harvest_started_at timestamptz,
  harvest_completed_at timestamptz,
  last_progress_at timestamptz,
  last_reminder_at timestamptz,
  prep_alert_sent boolean not null default false,
  pickup_done boolean not null default false,
  pickup_done_at timestamptz,
  pickup_done_by uuid references public.profiles(id),
  pickup_done_by_name text,
  received_done boolean not null default false,
  received_done_at timestamptz,
  received_done_by uuid references public.profiles(id),
  received_done_by_name text,
  unique (order_id, farm_id),
  check (not received_done or pickup_done),
  check (not pickup_done or harvest_status = 'completed')
);

-- Append-only progress history (stores raw integers so history survives step config changes)
create table if not exists public.harvest_progress_events (
  id uuid primary key default gen_random_uuid(),
  farm_allocation_id uuid not null references public.farm_allocations(id) on delete cascade,
  previous_pct smallint not null check (previous_pct between 0 and 100),
  new_pct smallint not null check (new_pct between 1 and 100 and new_pct <> previous_pct),
  is_correction boolean not null default false,
  reason text,
  recorded_by uuid not null references public.profiles(id),
  recorded_by_name text not null,
  recorded_at timestamptz not null default now(),
  check (
    (not is_correction and new_pct > previous_pct)
    or (is_correction and new_pct < previous_pct)
  )
);

-- Department-targeted notifications (shared delivery per target_role)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  target_role public.user_role not null,
  type text not null,
  severity public.notification_severity not null default 'info',
  title_key text not null,
  message_key text not null,
  params jsonb not null default '{}'::jsonb,
  order_id uuid references public.orders(id) on delete cascade,
  allocation_id uuid references public.farm_allocations(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Per-user read tracking (marking a notification read only affects the current user)
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- Append-only operational & administrative audit log
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  order_ref text,
  actor_id uuid references public.profiles(id),
  actor_name text not null,
  actor_role public.user_role not null,
  action_key text not null,
  params jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Case-Insensitive Uniqueness & Performance Indexes
-- ----------------------------------------------------------------------------
create unique index if not exists idx_profiles_email_lower on public.profiles (lower(trim(email)));
create unique index if not exists idx_farms_name_lower on public.farms (lower(trim(name)));
create unique index if not exists idx_farms_code_lower on public.farms (lower(trim(code))) where code is not null;

create index if not exists idx_orders_priority_status on public.orders (status, priority desc, created_at desc);
create index if not exists idx_allocations_order on public.farm_allocations (order_id);
create index if not exists idx_allocations_active_harvest
  on public.farm_allocations (harvest_status, current_progress_pct, last_reminder_at);
create index if not exists idx_progress_events_alloc
  on public.harvest_progress_events (farm_allocation_id, recorded_at asc);
create index if not exists idx_notifications_role_created
  on public.notifications (target_role, created_at desc);
create index if not exists idx_notification_reads_user
  on public.notification_reads (user_id, read_at desc);
create index if not exists idx_order_events_order on public.order_events (order_id, occurred_at desc);
create index if not exists idx_order_events_time on public.order_events (occurred_at desc);

-- ----------------------------------------------------------------------------
-- 4. Default Configuration Seed
-- ----------------------------------------------------------------------------
insert into public.app_settings (singleton, harvest_reminder_interval_minutes, transport_prep_alert_threshold_pct)
values (true, 60, 70)
on conflict (singleton) do nothing;

insert into public.harvest_progress_steps (percentage)
values (30), (50), (70), (100)
on conflict (percentage) do nothing;

insert into public.farms (name, code, is_active)
select v.name, v.code, true
from (values
  ('Ferme Atlas', 'FRM-01'),
  ('Ferme Vallée Verte', 'FRM-02'),
  ('Ferme Soleil Sud', 'FRM-03'),
  ('Ferme Oasis Nord', 'FRM-04')
) as v(name, code)
where not exists (
  select 1 from public.farms f where lower(trim(f.name)) = lower(trim(v.name))
);

-- ----------------------------------------------------------------------------
-- 5. Integrity, Security & Immutability Triggers
-- ----------------------------------------------------------------------------

-- Protect 100% completion step from deletion or alteration
create or replace function public.fn_protect_100_step()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' and old.percentage = 100 then
    raise exception '100%% progress step is mandatory and cannot be deleted';
  end if;
  if tg_op = 'UPDATE' and old.percentage = 100 and new.percentage <> 100 then
    raise exception '100%% progress step is mandatory and cannot be modified';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_protect_100_step on public.harvest_progress_steps;
create trigger trg_protect_100_step
before update or delete on public.harvest_progress_steps
for each row execute function public.fn_protect_100_step();

-- Enforce active farm on new allocations
create or replace function public.fn_require_active_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_active boolean;
begin
  select is_active into v_active from public.farms where id = new.farm_id;
  if coalesce(v_active, false) is false then
    raise exception 'Only active farms can be assigned to new harvest allocations';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_active_farm on public.farm_allocations;
create trigger trg_require_active_farm
before insert on public.farm_allocations
for each row execute function public.fn_require_active_farm();

-- Guard harvest progress updates:
--  * Normal updates must move strictly forward.
--  * Downward corrections are permitted ONLY via rpc_correct_farm_progress
--    (signaled via transaction-local setting app.allow_progress_correction = 'true').
--  * Already-completed harvests (100%) and picked-up allocations can NEVER be regressed.
create or replace function public.fn_guard_progress_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.harvest_status = 'completed' and (
    new.harvest_status <> 'completed' or new.current_progress_pct <> old.current_progress_pct
  ) then
    raise exception 'Completed harvest (100%%) cannot be reopened or modified';
  end if;

  if old.pickup_done and not new.pickup_done then
    raise exception 'Existing pickup confirmation cannot be reset automatically';
  end if;

  if new.current_progress_pct < old.current_progress_pct then
    if coalesce(current_setting('app.allow_progress_correction', true), '') <> 'true' then
      raise exception 'Harvest progress cannot decrease outside the authorized correction RPC (current: % pct, attempted: % pct)',
        old.current_progress_pct, new.current_progress_pct;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_progress_regression on public.farm_allocations;
drop trigger if exists trg_guard_progress_change on public.farm_allocations;
create trigger trg_guard_progress_change
before update on public.farm_allocations
for each row execute function public.fn_guard_progress_change();

-- Enforce append-only audit & progress event tables
create or replace function public.fn_prevent_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception '% is append-only and cannot be modified or deleted', tg_table_name;
end;
$$;

drop trigger if exists trg_append_only_order_events on public.order_events;
create trigger trg_append_only_order_events
before update or delete on public.order_events
for each row execute function public.fn_prevent_mutation();

drop trigger if exists trg_append_only_progress_events on public.harvest_progress_events;
create trigger trg_append_only_progress_events
before update or delete on public.harvest_progress_events
for each row execute function public.fn_prevent_mutation();

-- Prevent non-admin authenticated users from changing their own role, active status, name, or email
create or replace function public.fn_guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_caller_role public.user_role;
begin
  -- Trusted backend / SQL Editor (service_role or postgres) has no user JWT uid
  if auth.uid() is null then
    new.updated_at := now();
    return new;
  end if;

  select role into v_caller_role
  from public.profiles
  where id = auth.uid() and is_active = true;

  if v_caller_role is distinct from 'admin' then
    if new.role <> old.role
      or new.is_active <> old.is_active
      or new.email <> old.email
      or new.full_name <> old.full_name then
      raise exception 'Only administrators can modify role, active status, name, or email';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_self_update on public.profiles;
create trigger trg_guard_profile_self_update
before update on public.profiles
for each row execute function public.fn_guard_profile_self_update();

-- SECURITY: Auto-create profile with SAFE default role 'viewer'.
-- NEVER reads role from user-controlled signup metadata!
-- Operational roles are assigned exclusively by the Admin Edge Function (or SQL Editor bootstrap).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_lang text;
  v_name text;
begin
  v_lang := case
    when (new.raw_user_meta_data ->> 'preferred_language') = 'es' then 'es'
    else 'fr'
  end;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, full_name, email, role, preferred_language, is_active, password_updated_at)
  values (
    new.id,
    v_name,
    lower(trim(new.email)),
    'viewer',
    v_lang,
    true,
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- 6. Auth & Authorization Helpers
-- ----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select role
  from public.profiles
  where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists(
    select 1 from public.profiles where id = auth.uid() and is_active = true
  );
$$;

-- ----------------------------------------------------------------------------
-- 7. Row Level Security (RLS)
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.farms enable row level security;
alter table public.harvest_progress_steps enable row level security;
alter table public.app_settings enable row level security;
alter table public.orders enable row level security;
alter table public.farm_allocations enable row level security;
alter table public.harvest_progress_events enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.order_events enable row level security;

-- Profiles: active users read own profile; active admins read all; active users update own language
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
for select to authenticated
using (
  (id = auth.uid() and is_active = true)
  or public.current_user_role() = 'admin'
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update to authenticated
using (id = auth.uid() and is_active = true)
with check (id = auth.uid() and is_active = true);

-- Shared operational read access for active authenticated employees (including viewer)
drop policy if exists "farms_select" on public.farms;
create policy "farms_select" on public.farms
for select to authenticated using (public.is_active_user());

drop policy if exists "steps_select" on public.harvest_progress_steps;
create policy "steps_select" on public.harvest_progress_steps
for select to authenticated using (public.is_active_user());

drop policy if exists "settings_select" on public.app_settings;
create policy "settings_select" on public.app_settings
for select to authenticated using (public.is_active_user());

drop policy if exists "orders_select" on public.orders;
create policy "orders_select" on public.orders
for select to authenticated using (public.is_active_user());

drop policy if exists "allocations_select" on public.farm_allocations;
create policy "allocations_select" on public.farm_allocations
for select to authenticated using (public.is_active_user());

drop policy if exists "progress_events_select" on public.harvest_progress_events;
create policy "progress_events_select" on public.harvest_progress_events
for select to authenticated using (public.is_active_user());

drop policy if exists "order_events_select" on public.order_events;
create policy "order_events_select" on public.order_events
for select to authenticated using (public.is_active_user());

-- Notifications scoped to active caller's department (admin sees all; viewer sees none)
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
for select to authenticated
using (
  public.is_active_user()
  and public.current_user_role() <> 'viewer'
  and (target_role = public.current_user_role() or public.current_user_role() = 'admin')
);

-- Per-user read receipts: each employee sees only their own read rows
drop policy if exists "notification_reads_select_own" on public.notification_reads;
create policy "notification_reads_select_own" on public.notification_reads
for select to authenticated
using (user_id = auth.uid() and public.is_active_user());

-- All operational and admin writes execute exclusively via validated RPCs below.

-- ----------------------------------------------------------------------------
-- 8. Transactional Business RPCs (Strict Role Checks, Active-User Guards, Audit)
-- ----------------------------------------------------------------------------

-- 8.1 Create Order (Commercial / Admin)
create or replace function public.rpc_create_order(
  p_product text,
  p_quantity_kg integer,
  p_priority public.order_priority default 'normal',
  p_notes text default null
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_order public.orders;
  v_priority_label text;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role not in ('commercial', 'admin') then
    raise exception 'Unauthorized: active Commercial or Admin role required';
  end if;

  if length(trim(coalesce(p_product, ''))) = 0 or p_quantity_kg is null or p_quantity_kg <= 0 then
    raise exception 'Invalid order product or quantity';
  end if;

  insert into public.orders (product, quantity_kg, priority, notes, created_by, created_by_name)
  values (
    trim(p_product),
    p_quantity_kg,
    coalesce(p_priority, 'normal'),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_profile.id,
    v_profile.full_name
  )
  returning * into v_order;

  v_priority_label := case when v_order.priority = 'urgent' then 'Urgent' else 'Normal' end;

  insert into public.notifications (
    target_role, type, severity, title_key, message_key, params, order_id
  )
  values (
    'farm_coordinator',
    'new_order',
    case when v_order.priority = 'urgent' then 'urgent'::public.notification_severity else 'info'::public.notification_severity end,
    'notifications.types.new_order_title',
    'notifications.types.new_order_body',
    jsonb_build_object(
      'ref', v_order.reference,
      'qty', v_order.quantity_kg,
      'product', v_order.product,
      'priority', v_priority_label
    ),
    v_order.id
  );

  insert into public.order_events (
    order_id, order_ref, actor_id, actor_name, actor_role, action_key, params
  )
  values (
    v_order.id,
    v_order.reference,
    v_profile.id,
    v_profile.full_name,
    v_profile.role,
    'history.actions.order_created',
    jsonb_build_object(
      'qty', v_order.quantity_kg,
      'product', v_order.product,
      'priority', v_priority_label
    )
  );

  return v_order;
end;
$$;

-- 8.2 Save Farm Allocations (Juan / Admin) - Does NOT start harvesting!
-- Validates duplicates, active farms, positive integer quantities, and exact sum atomically.
create or replace function public.rpc_save_order_allocations(
  p_order_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_order public.orders;
  v_item jsonb;
  v_farm_id uuid;
  v_farm public.farms;
  v_qty integer;
  v_total integer := 0;
  v_seen_farms uuid[] := array[]::uuid[];
  v_summary text := '';
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role not in ('farm_coordinator', 'admin') then
    raise exception 'Unauthorized: active Farm Coordinator or Admin role required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if v_order.status not in ('pending_allocation', 'allocated') or v_order.harvest_started_at is not null then
    raise exception 'Cannot modify allocations after harvesting has started';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one farm allocation is required';
  end if;

  -- Pass 1: Validate every item, reject duplicates, verify active farms & exact quantity sum
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each allocation item must be an object';
    end if;

    begin
      v_farm_id := (v_item ->> 'farmId')::uuid;
      v_qty := (v_item ->> 'allocatedQtyKg')::integer;
    exception when others then
      raise exception 'Invalid farmId or allocatedQtyKg in allocation payload';
    end;

    if v_farm_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'Each allocation must specify a valid farm and quantity > 0';
    end if;

    if v_farm_id = any(v_seen_farms) then
      raise exception 'Duplicate farm assignment detected in allocation payload';
    end if;
    v_seen_farms := array_append(v_seen_farms, v_farm_id);

    select * into v_farm
    from public.farms
    where id = v_farm_id
    for share;

    if v_farm.id is null or not v_farm.is_active then
      raise exception 'Selected farm does not exist or is inactive';
    end if;

    v_total := v_total + v_qty;
  end loop;

  if v_total <> v_order.quantity_kg then
    raise exception 'Allocated sum (% kg) must equal requested order quantity (% kg)', v_total, v_order.quantity_kg;
  end if;

  -- Pass 2: Replace allocations atomically inside this transaction
  delete from public.farm_allocations where order_id = p_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_farm_id := (v_item ->> 'farmId')::uuid;
    v_qty := (v_item ->> 'allocatedQtyKg')::integer;

    select * into v_farm from public.farms where id = v_farm_id;

    insert into public.farm_allocations (
      order_id, farm_id, farm_name_snapshot, allocated_qty_kg, harvest_status, current_progress_pct
    )
    values (p_order_id, v_farm.id, v_farm.name, v_qty, 'pending', 0);

    v_summary := case when v_summary = '' then '' else v_summary || ', ' end
      || v_farm.name || ' (' || v_qty || ' kg)';
  end loop;

  update public.orders
  set status = 'allocated', allocated_at = now(), updated_at = now()
  where id = p_order_id;

  insert into public.order_events (
    order_id, order_ref, actor_id, actor_name, actor_role, action_key, params
  )
  values (
    v_order.id,
    v_order.reference,
    v_profile.id,
    v_profile.full_name,
    v_profile.role,
    'history.actions.farms_allocated',
    jsonb_build_object('summary', v_summary)
  );
end;
$$;

-- 8.3 Explicit Start Harvesting (Juan / Admin)
create or replace function public.rpc_start_harvesting(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_order public.orders;
  v_settings public.app_settings;
  v_farms_count integer;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role not in ('farm_coordinator', 'admin') then
    raise exception 'Unauthorized: active Farm Coordinator or Admin role required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.status <> 'allocated' then
    raise exception 'Order must be allocated before starting harvest';
  end if;

  select count(*) into v_farms_count from public.farm_allocations where order_id = p_order_id;
  if v_farms_count = 0 then
    raise exception 'Order has no allocated farms';
  end if;

  select * into v_settings from public.app_settings where singleton = true;

  update public.orders
  set status = 'in_progress', harvest_started_at = now(), updated_at = now()
  where id = p_order_id;

  update public.farm_allocations
  set harvest_status = 'in_progress', harvest_started_at = now(), last_reminder_at = now()
  where order_id = p_order_id;

  insert into public.notifications (
    target_role, type, severity, title_key, message_key, params, order_id
  )
  values (
    'transport',
    'harvest_started',
    case when v_order.priority = 'urgent' then 'urgent'::public.notification_severity else 'info'::public.notification_severity end,
    'notifications.types.harvest_started_title',
    'notifications.types.harvest_started_body',
    jsonb_build_object(
      'ref', v_order.reference,
      'farmsCount', v_farms_count,
      'qty', v_order.quantity_kg,
      'product', v_order.product
    ),
    v_order.id
  );

  insert into public.order_events (
    order_id, order_ref, actor_id, actor_name, actor_role, action_key, params
  )
  values (
    v_order.id,
    v_order.reference,
    v_profile.id,
    v_profile.full_name,
    v_profile.role,
    'history.actions.harvest_started',
    jsonb_build_object('interval', v_settings.harvest_reminder_interval_minutes)
  );
end;
$$;

-- 8.4 Update Farm Progress (Juan / Admin) - Strictly Forward-Only!
create or replace function public.rpc_update_farm_progress(
  p_order_id uuid,
  p_allocation_id uuid,
  p_new_pct smallint
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_order public.orders;
  v_alloc public.farm_allocations;
  v_settings public.app_settings;
  v_farm_name text;
  v_step_exists boolean;
  v_is_complete boolean;
  v_crossed_prep boolean;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role not in ('farm_coordinator', 'admin') then
    raise exception 'Unauthorized: active Farm Coordinator or Admin role required';
  end if;

  select exists(select 1 from public.harvest_progress_steps where percentage = p_new_pct)
    into v_step_exists;
  if not v_step_exists then
    raise exception 'Percentage % is not in configured harvest progress steps', p_new_pct;
  end if;

  select * into v_order from public.orders where id = p_order_id;
  select * into v_alloc
  from public.farm_allocations
  where id = p_allocation_id and order_id = p_order_id
  for update;

  if v_order.id is null or v_alloc.id is null or v_alloc.harvest_status <> 'in_progress' then
    raise exception 'Active farm allocation not found';
  end if;

  -- Strictly forward-only progress (prevents accidental regression e.g. 70% -> 30%)
  if p_new_pct <= v_alloc.current_progress_pct then
    raise exception 'Progress can only move forward (current: % pct, requested: % pct)',
      v_alloc.current_progress_pct, p_new_pct;
  end if;

  select * into v_settings from public.app_settings where singleton = true;
  select coalesce(f.name, v_alloc.farm_name_snapshot) into v_farm_name
  from public.farms f where f.id = v_alloc.farm_id;

  v_is_complete := p_new_pct = 100;
  v_crossed_prep := (not v_is_complete)
    and (not v_alloc.prep_alert_sent)
    and (p_new_pct >= v_settings.transport_prep_alert_threshold_pct);

  update public.farm_allocations
  set
    current_progress_pct = p_new_pct,
    harvest_status = case when v_is_complete then 'completed'::public.harvest_status else 'in_progress'::public.harvest_status end,
    harvest_completed_at = case when v_is_complete then now() else harvest_completed_at end,
    last_progress_at = now(),
    prep_alert_sent = prep_alert_sent or v_crossed_prep or v_is_complete
  where id = p_allocation_id;

  insert into public.harvest_progress_events (
    farm_allocation_id, previous_pct, new_pct, is_correction, reason, recorded_by, recorded_by_name
  )
  values (p_allocation_id, v_alloc.current_progress_pct, p_new_pct, false, null, v_profile.id, v_profile.full_name);

  insert into public.order_events (
    order_id, order_ref, actor_id, actor_name, actor_role, action_key, params
  )
  values (
    v_order.id,
    v_order.reference,
    v_profile.id,
    v_profile.full_name,
    v_profile.role,
    'history.actions.progress_updated',
    jsonb_build_object('farm', v_farm_name, 'prev', v_alloc.current_progress_pct, 'next', p_new_pct)
  );

  if v_crossed_prep then
    insert into public.notifications (
      target_role, type, severity, title_key, message_key, params, order_id, allocation_id
    )
    values (
      'transport',
      'transport_prep',
      case when v_order.priority = 'urgent' then 'urgent'::public.notification_severity else 'warning'::public.notification_severity end,
      'notifications.types.transport_prep_title',
      'notifications.types.transport_prep_body',
      jsonb_build_object('ref', v_order.reference, 'farm', v_farm_name, 'pct', p_new_pct, 'qty', v_alloc.allocated_qty_kg, 'product', v_order.product),
      v_order.id,
      v_alloc.id
    );
  end if;

  if v_is_complete then
    insert into public.notifications (
      target_role, type, severity, title_key, message_key, params, order_id, allocation_id
    )
    values (
      'transport',
      'harvest_ready',
      case when v_order.priority = 'urgent' then 'urgent'::public.notification_severity else 'success'::public.notification_severity end,
      'notifications.types.harvest_ready_title',
      'notifications.types.harvest_ready_body',
      jsonb_build_object('ref', v_order.reference, 'farm', v_farm_name, 'qty', v_alloc.allocated_qty_kg, 'product', v_order.product),
      v_order.id,
      v_alloc.id
    );

    insert into public.order_events (
      order_id, order_ref, actor_id, actor_name, actor_role, action_key, params
    )
    values (
      v_order.id,
      v_order.reference,
      v_profile.id,
      v_profile.full_name,
      v_profile.role,
      'history.actions.harvest_completed',
      jsonb_build_object('farm', v_farm_name)
    );
  end if;
end;
$$;

-- 8.4b Authorized Downward Progress Correction (Juan / Admin)
-- Allows correcting an accidentally entered higher percentage on an ACTIVE (< 100%) harvest.
-- Never reopens a completed (100%) harvest and never resets pickup confirmations.
-- Notifies Transport whenever the correction affects harvest preparation (>= prep threshold).
create or replace function public.rpc_correct_farm_progress(
  p_order_id uuid,
  p_allocation_id uuid,
  p_corrected_pct smallint,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_order public.orders;
  v_alloc public.farm_allocations;
  v_settings public.app_settings;
  v_farm_name text;
  v_step_exists boolean;
  v_clean_reason text;
  v_affects_transport_prep boolean;
  v_drops_below_threshold boolean;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role not in ('farm_coordinator', 'admin') then
    raise exception 'Unauthorized: active Farm Coordinator or Admin role required';
  end if;

  select exists(
    select 1 from public.harvest_progress_steps
    where percentage = p_corrected_pct and percentage < 100
  ) into v_step_exists;
  if not v_step_exists then
    raise exception 'Corrected percentage % must be a configured active step below 100%%', p_corrected_pct;
  end if;

  select * into v_order from public.orders where id = p_order_id;
  select * into v_alloc
  from public.farm_allocations
  where id = p_allocation_id and order_id = p_order_id
  for update;

  if v_order.id is null or v_alloc.id is null then
    raise exception 'Farm allocation not found';
  end if;

  if v_alloc.harvest_status <> 'in_progress' or v_alloc.current_progress_pct >= 100 then
    raise exception 'Completed harvest (100%%) or inactive allocation cannot be corrected';
  end if;

  if v_alloc.pickup_done or v_alloc.received_done then
    raise exception 'Cannot correct progress after pickup or reception has been confirmed';
  end if;

  if p_corrected_pct >= v_alloc.current_progress_pct then
    raise exception 'Correction must specify a percentage lower than current progress (current: % pct, requested: % pct)',
      v_alloc.current_progress_pct, p_corrected_pct;
  end if;

  select * into v_settings from public.app_settings where singleton = true;
  select coalesce(f.name, v_alloc.farm_name_snapshot) into v_farm_name
  from public.farms f where f.id = v_alloc.farm_id;

  v_clean_reason := nullif(trim(coalesce(p_reason, '')), '');
  v_affects_transport_prep := v_alloc.prep_alert_sent
    or v_alloc.current_progress_pct >= v_settings.transport_prep_alert_threshold_pct;
  v_drops_below_threshold := p_corrected_pct < v_settings.transport_prep_alert_threshold_pct;

  -- Transaction-local authorization flag consumed by trg_guard_progress_change
  perform set_config('app.allow_progress_correction', 'true', true);

  update public.farm_allocations
  set
    current_progress_pct = p_corrected_pct,
    last_progress_at = now(),
    -- Allow transport prep alert to re-fire later only if corrected below threshold
    prep_alert_sent = case when v_drops_below_threshold then false else prep_alert_sent end
  where id = p_allocation_id;

  perform set_config('app.allow_progress_correction', 'false', true);

  insert into public.harvest_progress_events (
    farm_allocation_id, previous_pct, new_pct, is_correction, reason, recorded_by, recorded_by_name
  )
  values (
    p_allocation_id,
    v_alloc.current_progress_pct,
    p_corrected_pct,
    true,
    v_clean_reason,
    v_profile.id,
    v_profile.full_name
  );

  insert into public.order_events (
    order_id, order_ref, actor_id, actor_name, actor_role, action_key, params
  )
  values (
    v_order.id,
    v_order.reference,
    v_profile.id,
    v_profile.full_name,
    v_profile.role,
    case
      when v_clean_reason is not null then 'history.actions.progress_corrected_with_reason'
      else 'history.actions.progress_corrected'
    end,
    jsonb_build_object(
      'farm', v_farm_name,
      'prev', v_alloc.current_progress_pct,
      'next', p_corrected_pct,
      'reason', coalesce(v_clean_reason, '')
    )
  );

  -- Notify Transport whenever the correction affects harvest preparation
  if v_affects_transport_prep then
    insert into public.notifications (
      target_role, type, severity, title_key, message_key, params, order_id, allocation_id
    )
    values (
      'transport',
      'transport_prep_corrected',
      case when v_order.priority = 'urgent' then 'urgent'::public.notification_severity else 'warning'::public.notification_severity end,
      'notifications.types.transport_prep_corrected_title',
      'notifications.types.transport_prep_corrected_body',
      jsonb_build_object(
        'ref', v_order.reference,
        'farm', v_farm_name,
        'prev', v_alloc.current_progress_pct,
        'pct', p_corrected_pct,
        'qty', v_alloc.allocated_qty_kg,
        'product', v_order.product
      ),
      v_order.id,
      v_alloc.id
    );
  end if;
end;
$$;

-- 8.5 Periodic Harvest Reminders
-- IMPORTANT: Creating this function does NOT automatically schedule it.
-- Reminders only fire for orders explicitly started by Juan (harvest_started_at IS NOT NULL).
-- In production (Phase 4), schedule `select public.rpc_trigger_active_reminders(false);`
-- via pg_cron or a scheduled Edge Function running with service_role.
create or replace function public.rpc_trigger_active_reminders(p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_caller_role public.user_role;
  v_interval integer;
  v_rec record;
  v_count integer := 0;
begin
  -- Allow ONLY: (a) service_role / postgres scheduler, OR (b) active Farm Coordinator / Admin
  if v_jwt_role = 'service_role' or (auth.uid() is null and session_user in ('postgres', 'supabase_admin')) then
    -- Trusted backend / cron execution
    null;
  else
    select role into v_caller_role
    from public.profiles
    where id = auth.uid() and is_active = true;

    if v_caller_role is null or v_caller_role not in ('farm_coordinator', 'admin') then
      raise exception 'Unauthorized: active Farm Coordinator, Admin, or trusted scheduler required';
    end if;
  end if;

  select harvest_reminder_interval_minutes into v_interval
  from public.app_settings where singleton = true;

  for v_rec in
    select
      a.id as alloc_id,
      a.order_id,
      a.current_progress_pct,
      coalesce(f.name, a.farm_name_snapshot) as farm_name,
      o.reference,
      o.priority
    from public.farm_allocations a
    join public.orders o on o.id = a.order_id
    left join public.farms f on f.id = a.farm_id
    where o.status = 'in_progress'
      and o.harvest_started_at is not null
      and a.harvest_status = 'in_progress'
      and a.harvest_started_at is not null
      and a.current_progress_pct < 100
      and (
        p_force = true
        or now() - coalesce(a.last_reminder_at, a.harvest_started_at)
           >= make_interval(mins => v_interval)
      )
    for update of a skip locked
  loop
    insert into public.notifications (
      target_role, type, severity, title_key, message_key, params, order_id, allocation_id
    )
    values (
      'farm_coordinator',
      'harvest_reminder',
      case when v_rec.priority = 'urgent' then 'urgent'::public.notification_severity else 'warning'::public.notification_severity end,
      'notifications.types.harvest_reminder_title',
      'notifications.types.harvest_reminder_body',
      jsonb_build_object('ref', v_rec.reference, 'farm', v_rec.farm_name, 'pct', v_rec.current_progress_pct),
      v_rec.order_id,
      v_rec.alloc_id
    );

    update public.farm_allocations set last_reminder_at = now() where id = v_rec.alloc_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- 8.6 Transport Confirm Pickup Done (Transport / Admin)
create or replace function public.rpc_confirm_pickup_done(
  p_order_id uuid,
  p_allocation_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_order public.orders;
  v_alloc public.farm_allocations;
  v_farm_name text;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role not in ('transport', 'admin') then
    raise exception 'Unauthorized: active Transport or Admin role required';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  select * into v_alloc
  from public.farm_allocations
  where id = p_allocation_id and order_id = p_order_id
  for update;

  if v_order.id is null or v_alloc.id is null or v_alloc.harvest_status <> 'completed' or v_alloc.pickup_done then
    raise exception 'Farm allocation is not ready for pickup confirmation';
  end if;

  select coalesce(f.name, v_alloc.farm_name_snapshot) into v_farm_name
  from public.farms f where f.id = v_alloc.farm_id;

  update public.farm_allocations
  set pickup_done = true, pickup_done_at = now(), pickup_done_by = v_profile.id, pickup_done_by_name = v_profile.full_name
  where id = p_allocation_id;

  insert into public.notifications (
    target_role, type, severity, title_key, message_key, params, order_id, allocation_id
  )
  values (
    'warehouse',
    'pickup_done',
    case when v_order.priority = 'urgent' then 'urgent'::public.notification_severity else 'info'::public.notification_severity end,
    'notifications.types.pickup_done_title',
    'notifications.types.pickup_done_body',
    jsonb_build_object('ref', v_order.reference, 'farm', v_farm_name, 'qty', v_alloc.allocated_qty_kg, 'product', v_order.product),
    v_order.id,
    v_alloc.id
  );

  insert into public.order_events (
    order_id, order_ref, actor_id, actor_name, actor_role, action_key, params
  )
  values (
    v_order.id,
    v_order.reference,
    v_profile.id,
    v_profile.full_name,
    v_profile.role,
    'history.actions.pickup_confirmed',
    jsonb_build_object('farm', v_farm_name)
  );
end;
$$;

-- 8.7 Warehouse Confirm Received (Warehouse / Admin)
create or replace function public.rpc_confirm_warehouse_received(
  p_order_id uuid,
  p_allocation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_order public.orders;
  v_alloc public.farm_allocations;
  v_farm_name text;
  v_all_done boolean;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role not in ('warehouse', 'admin') then
    raise exception 'Unauthorized: active Warehouse or Admin role required';
  end if;

  -- Lock parent order first to serialize concurrent last-delivery completions safely
  select * into v_order from public.orders where id = p_order_id for update;
  select * into v_alloc
  from public.farm_allocations
  where id = p_allocation_id and order_id = p_order_id
  for update;

  if v_order.id is null or v_alloc.id is null or not v_alloc.pickup_done or v_alloc.received_done then
    raise exception 'Delivery is not ready for warehouse reception';
  end if;

  select coalesce(f.name, v_alloc.farm_name_snapshot) into v_farm_name
  from public.farms f where f.id = v_alloc.farm_id;

  update public.farm_allocations
  set received_done = true, received_done_at = now(), received_done_by = v_profile.id, received_done_by_name = v_profile.full_name
  where id = p_allocation_id;

  insert into public.order_events (
    order_id, order_ref, actor_id, actor_name, actor_role, action_key, params
  )
  values (
    v_order.id,
    v_order.reference,
    v_profile.id,
    v_profile.full_name,
    v_profile.role,
    'history.actions.warehouse_received',
    jsonb_build_object('farm', v_farm_name)
  );

  select not exists(
    select 1 from public.farm_allocations
    where order_id = p_order_id
      and (harvest_status <> 'completed' or not pickup_done or not received_done)
  ) into v_all_done;

  if v_all_done and v_order.status <> 'completed' then
    update public.orders
    set status = 'completed', completed_at = now(), updated_at = now()
    where id = p_order_id;

    insert into public.order_events (
      order_id, order_ref, actor_id, actor_name, actor_role, action_key, params
    )
    values (
      v_order.id,
      v_order.reference,
      v_profile.id,
      v_profile.full_name,
      v_profile.role,
      'history.actions.order_completed',
      '{}'::jsonb
    );

    insert into public.notifications (
      target_role, type, severity, title_key, message_key, params, order_id
    )
    values
      ('commercial', 'order_completed', 'success', 'notifications.types.order_completed_title', 'notifications.types.order_completed_body',
        jsonb_build_object('ref', v_order.reference, 'product', v_order.product, 'qty', v_order.quantity_kg), v_order.id),
      ('admin', 'order_completed', 'success', 'notifications.types.order_completed_title', 'notifications.types.order_completed_body',
        jsonb_build_object('ref', v_order.reference, 'product', v_order.product, 'qty', v_order.quantity_kg), v_order.id);
  end if;

  return v_all_done;
end;
$$;

-- 8.8 Admin Farm Management RPCs
create or replace function public.rpc_admin_add_farm(p_name text, p_code text default null)
returns public.farms
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_farm public.farms;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'Unauthorized: active Admin role required';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Farm name is required';
  end if;

  insert into public.farms (name, code, is_active)
  values (trim(p_name), nullif(trim(coalesce(p_code, '')), ''), true)
  returning * into v_farm;

  insert into public.order_events (actor_id, actor_name, actor_role, action_key, params)
  values (v_profile.id, v_profile.full_name, v_profile.role, 'history.actions.admin_farm_created', jsonb_build_object('name', v_farm.name));

  return v_farm;
end;
$$;

create or replace function public.rpc_admin_update_farm(p_farm_id uuid, p_name text, p_code text default null)
returns public.farms
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_farm public.farms;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'Unauthorized: active Admin role required';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Farm name is required';
  end if;

  update public.farms
  set name = trim(p_name), code = nullif(trim(coalesce(p_code, '')), ''), updated_at = now()
  where id = p_farm_id
  returning * into v_farm;

  if v_farm.id is null then
    raise exception 'Farm not found';
  end if;

  insert into public.order_events (actor_id, actor_name, actor_role, action_key, params)
  values (v_profile.id, v_profile.full_name, v_profile.role, 'history.actions.admin_farm_updated', jsonb_build_object('name', v_farm.name));

  return v_farm;
end;
$$;

create or replace function public.rpc_admin_toggle_farm_active(p_farm_id uuid)
returns public.farms
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_farm public.farms;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'Unauthorized: active Admin role required';
  end if;

  update public.farms
  set is_active = not is_active, updated_at = now()
  where id = p_farm_id
  returning * into v_farm;

  if v_farm.id is null then
    raise exception 'Farm not found';
  end if;

  insert into public.order_events (actor_id, actor_name, actor_role, action_key, params)
  values (
    v_profile.id,
    v_profile.full_name,
    v_profile.role,
    'history.actions.admin_farm_toggled',
    jsonb_build_object('name', v_farm.name, 'status', case when v_farm.is_active then 'active' else 'inactive' end)
  );

  return v_farm;
end;
$$;

-- 8.9 Admin Harvest & Alert Settings RPC
create or replace function public.rpc_admin_update_harvest_settings(
  p_steps smallint[],
  p_reminder_interval integer,
  p_prep_threshold smallint
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_step smallint;
  v_clean_steps smallint[];
  v_steps_text text;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'Unauthorized: active Admin role required';
  end if;

  if p_reminder_interval is null or p_reminder_interval < 5 or p_reminder_interval > 1440 then
    raise exception 'Reminder interval must be between 5 and 1440 minutes';
  end if;

  if p_prep_threshold is null or p_prep_threshold < 1 or p_prep_threshold > 99 then
    raise exception 'Transport preparation threshold must be between 1 and 99';
  end if;

  select array_agg(distinct s order by s asc)
  into v_clean_steps
  from unnest(array_append(coalesce(p_steps, array[]::smallint[]), 100::smallint)) as s
  where s between 1 and 100;

  delete from public.harvest_progress_steps
  where percentage <> 100 and not (percentage = any(v_clean_steps));

  foreach v_step in array v_clean_steps
  loop
    insert into public.harvest_progress_steps (percentage, updated_by, updated_at)
    values (v_step, v_profile.id, now())
    on conflict (percentage) do update set updated_by = v_profile.id, updated_at = now();
  end loop;

  update public.app_settings
  set
    harvest_reminder_interval_minutes = p_reminder_interval,
    transport_prep_alert_threshold_pct = p_prep_threshold,
    updated_by = v_profile.id,
    updated_at = now()
  where singleton = true;

  select string_agg(s::text || '%', ', ' order by s asc)
  into v_steps_text
  from unnest(v_clean_steps) as s;

  insert into public.order_events (actor_id, actor_name, actor_role, action_key, params)
  values (
    v_profile.id,
    v_profile.full_name,
    v_profile.role,
    'history.actions.admin_settings_updated',
    jsonb_build_object('steps', v_steps_text, 'interval', p_reminder_interval, 'threshold', p_prep_threshold)
  );
end;
$$;

-- 8.10 Per-User Notification Read RPCs (Never affects other employees)
create or replace function public.rpc_mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_visible boolean;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role = 'viewer' then
    raise exception 'Unauthorized';
  end if;

  select exists(
    select 1 from public.notifications n
    where n.id = p_notification_id
      and (n.target_role = v_profile.role or v_profile.role = 'admin')
  ) into v_visible;

  if not v_visible then
    raise exception 'Notification not found or not accessible';
  end if;

  insert into public.notification_reads (notification_id, user_id, read_at)
  values (p_notification_id, v_profile.id, now())
  on conflict (notification_id, user_id) do nothing;
end;
$$;

create or replace function public.rpc_mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role = 'viewer' then
    raise exception 'Unauthorized';
  end if;

  insert into public.notification_reads (notification_id, user_id, read_at)
  select n.id, v_profile.id, now()
  from public.notifications n
  where (v_profile.role = 'admin' or n.target_role = v_profile.role)
  on conflict (notification_id, user_id) do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Strict Table, Function & Sequence Permissions (Least Privilege)
-- Revoke default PUBLIC / anon access from EVERY function & sequence.
-- Grant explicit table privileges to service_role for server-side Edge Functions.
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;

grant select, insert, update on public.profiles to service_role;
grant select, insert on public.order_events to service_role;
grant select on public.notifications to service_role;

revoke all on sequence public.order_ref_seq from public, anon, authenticated;

-- Trigger functions: internal only, zero direct RPC execution
revoke all on function public.fn_protect_100_step() from public, anon, authenticated;
revoke all on function public.fn_require_active_farm() from public, anon, authenticated;
revoke all on function public.fn_guard_progress_change() from public, anon, authenticated;
revoke all on function public.fn_prevent_mutation() from public, anon, authenticated;
revoke all on function public.fn_guard_profile_self_update() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

-- Auth helper functions: authenticated + service_role only
revoke all on function public.current_user_role() from public, anon, authenticated;
grant execute on function public.current_user_role() to authenticated, service_role;

revoke all on function public.is_active_user() from public, anon, authenticated;
grant execute on function public.is_active_user() to authenticated, service_role;

-- Operational & Admin RPCs: authenticated only (plus service_role where needed for schedulers)
revoke all on function public.rpc_create_order(text, integer, public.order_priority, text) from public, anon, authenticated;
grant execute on function public.rpc_create_order(text, integer, public.order_priority, text) to authenticated;

revoke all on function public.rpc_save_order_allocations(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_save_order_allocations(uuid, jsonb) to authenticated;

revoke all on function public.rpc_start_harvesting(uuid) from public, anon, authenticated;
grant execute on function public.rpc_start_harvesting(uuid) to authenticated;

revoke all on function public.rpc_update_farm_progress(uuid, uuid, smallint) from public, anon, authenticated;
grant execute on function public.rpc_update_farm_progress(uuid, uuid, smallint) to authenticated;

revoke all on function public.rpc_correct_farm_progress(uuid, uuid, smallint, text) from public, anon, authenticated;
grant execute on function public.rpc_correct_farm_progress(uuid, uuid, smallint, text) to authenticated;

revoke all on function public.rpc_trigger_active_reminders(boolean) from public, anon, authenticated;
grant execute on function public.rpc_trigger_active_reminders(boolean) to authenticated, service_role;

revoke all on function public.rpc_confirm_pickup_done(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rpc_confirm_pickup_done(uuid, uuid) to authenticated;

revoke all on function public.rpc_confirm_warehouse_received(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rpc_confirm_warehouse_received(uuid, uuid) to authenticated;

revoke all on function public.rpc_admin_add_farm(text, text) from public, anon, authenticated;
grant execute on function public.rpc_admin_add_farm(text, text) to authenticated;

revoke all on function public.rpc_admin_update_farm(uuid, text, text) from public, anon, authenticated;
grant execute on function public.rpc_admin_update_farm(uuid, text, text) to authenticated;

revoke all on function public.rpc_admin_toggle_farm_active(uuid) from public, anon, authenticated;
grant execute on function public.rpc_admin_toggle_farm_active(uuid) to authenticated;

revoke all on function public.rpc_admin_update_harvest_settings(smallint[], integer, smallint) from public, anon, authenticated;
grant execute on function public.rpc_admin_update_harvest_settings(smallint[], integer, smallint) to authenticated;

revoke all on function public.rpc_mark_notification_read(uuid) from public, anon, authenticated;
grant execute on function public.rpc_mark_notification_read(uuid) to authenticated;

revoke all on function public.rpc_mark_all_notifications_read() from public, anon, authenticated;
grant execute on function public.rpc_mark_all_notifications_read() to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Realtime Publication (Explicit Per-Table Check - Fails Loudly on Error)
-- ----------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_tables text[] := array[
    'orders',
    'farm_allocations',
    'farms',
    'harvest_progress_steps',
    'app_settings',
    'notifications',
    'notification_reads',
    'order_events',
    'profiles'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Publication supabase_realtime does not exist in this database';
  end if;

  foreach v_table in array v_tables
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;
