-- ============================================================================
-- HarvestFlow Phase 4 — Web Push Subscriptions & Notification Delivery Logs
-- Run AFTER 0001_harvestflow_v1.sql in Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Web Push Subscriptions (Standards-Based VAPID Subscriptions per Device)
-- ----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user_active
  on public.push_subscriptions (user_id, is_active);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_sub_select_own" on public.push_subscriptions;
create policy "push_sub_select_own" on public.push_subscriptions
for select to authenticated
using (
  (user_id = auth.uid() and public.is_active_user())
  or public.current_user_role() = 'admin'
);

-- ----------------------------------------------------------------------------
-- 2. Notification Delivery Attempts Log (Append-Only: In-App, Web Push, WhatsApp)
-- ----------------------------------------------------------------------------
create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  channel text not null check (channel in ('in_app', 'web_push', 'whatsapp')),
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_delivery_attempts_notif
  on public.notification_delivery_attempts (notification_id, attempted_at desc);

alter table public.notification_delivery_attempts enable row level security;

drop policy if exists "delivery_attempts_admin_select" on public.notification_delivery_attempts;
create policy "delivery_attempts_admin_select" on public.notification_delivery_attempts
for select to authenticated
using (public.current_user_role() = 'admin');

-- Enforce append-only delivery log (reuses fn_prevent_mutation from 0001)
drop trigger if exists trg_append_only_delivery_attempts on public.notification_delivery_attempts;
create trigger trg_append_only_delivery_attempts
before update or delete on public.notification_delivery_attempts
for each row execute function public.fn_prevent_mutation();

-- Automatically record an 'in_app' delivery attempt whenever a notification is inserted
create or replace function public.fn_log_in_app_delivery()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.notification_delivery_attempts (notification_id, channel, status)
  values (new.id, 'in_app', 'sent');
  return new;
end;
$$;

drop trigger if exists trg_log_in_app_delivery on public.notifications;
create trigger trg_log_in_app_delivery
after insert on public.notifications
for each row execute function public.fn_log_in_app_delivery();

-- ----------------------------------------------------------------------------
-- 3. Secure RPCs for Managing Device Push Subscriptions
-- Handles shared devices cleanly by reassigning endpoint to the active caller.
-- ----------------------------------------------------------------------------
create or replace function public.rpc_upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
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
    raise exception 'Unauthorized: active non-viewer account required';
  end if;

  if length(trim(coalesce(p_endpoint, ''))) = 0
    or length(trim(coalesce(p_p256dh, ''))) = 0
    or length(trim(coalesce(p_auth, ''))) = 0 then
    raise exception 'Invalid push subscription payload';
  end if;

  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, user_agent, is_active, last_seen_at
  )
  values (
    v_profile.id,
    trim(p_endpoint),
    trim(p_p256dh),
    trim(p_auth),
    nullif(trim(coalesce(p_user_agent, '')), ''),
    true,
    now()
  )
  on conflict (endpoint) do update
  set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    is_active = true,
    last_seen_at = now();
end;
$$;

create or replace function public.rpc_deactivate_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null then
    raise exception 'Unauthorized';
  end if;

  update public.push_subscriptions
  set is_active = false, last_seen_at = now()
  where endpoint = trim(p_endpoint) and user_id = v_profile.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Least-Privilege Permissions
-- ----------------------------------------------------------------------------
grant select, update on public.push_subscriptions to service_role;
grant select, insert on public.notification_delivery_attempts to service_role;

revoke all on function public.fn_log_in_app_delivery() from public, anon, authenticated;

revoke all on function public.rpc_upsert_push_subscription(text, text, text, text) from public, anon, authenticated;
grant execute on function public.rpc_upsert_push_subscription(text, text, text, text) to authenticated;

revoke all on function public.rpc_deactivate_push_subscription(text) from public, anon, authenticated;
grant execute on function public.rpc_deactivate_push_subscription(text) to authenticated;
