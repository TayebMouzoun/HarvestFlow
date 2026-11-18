-- ============================================================================
-- HarvestFlow - Admin-Configurable Agricultural Product Suggestions
-- Safe, idempotent migration. Run in Supabase SQL Editor after 0001.
-- ============================================================================

alter table public.app_settings
  add column if not exists product_suggestions text[] not null default array[
    'Poivrons rouges',
    'Tomates cerises',
    'Courgettes',
    'Haricots verts',
    'Poivrons jaunes',
    'Concombres'
  ];

create or replace function public.rpc_admin_update_product_suggestions(
  p_products text[]
)
returns text[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.profiles;
  v_clean text[];
begin
  select * into v_profile from public.profiles where id = auth.uid() and is_active = true;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'Unauthorized: active Admin role required';
  end if;

  -- Trim whitespace, drop blanks, cap length to 80 chars, and deduplicate case-insensitively
  -- while preserving the order chosen by the Administrator.
  with raw_items as (
    select
      left(trim(item), 80) as clean_name,
      ord
    from unnest(coalesce(p_products, array[]::text[])) with ordinality as t(item, ord)
    where length(trim(coalesce(item, ''))) > 0
  ),
  deduped as (
    select distinct on (lower(clean_name))
      clean_name,
      ord
    from raw_items
    order by lower(clean_name), ord asc
  )
  select coalesce(array_agg(clean_name order by ord asc), array[]::text[])
  into v_clean
  from deduped;

  update public.app_settings
  set
    product_suggestions = v_clean,
    updated_by = v_profile.id,
    updated_at = now()
  where singleton = true;

  insert into public.order_events (actor_id, actor_name, actor_role, action_key, params)
  values (
    v_profile.id,
    v_profile.full_name,
    v_profile.role,
    'history.actions.admin_products_updated',
    jsonb_build_object('count', coalesce(array_length(v_clean, 1), 0))
  );

  return v_clean;
end;
$$;

revoke all on function public.rpc_admin_update_product_suggestions(text[]) from public, anon, authenticated;
grant execute on function public.rpc_admin_update_product_suggestions(text[]) to authenticated;
