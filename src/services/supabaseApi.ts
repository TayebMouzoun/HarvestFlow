import { PRODUCT_SUGGESTIONS } from '../data/seed';
import { supabase } from '../lib/supabase';
import type {
  AppNotification,
  DemoUser,
  Farm,
  FarmAllocation,
  HarvestFlowState,
  HarvestProgressRecord,
  HarvestSettings,
  HistoryEvent,
  Language,
  Order,
  OrderPriority,
  UserRole,
} from '../types/domain';

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase client is not configured');
  }
  return supabase;
}

function computeInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  preferred_language: Language;
  is_active: boolean;
  password_updated_at: string | null;
}

interface FarmRow {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface StepRow {
  percentage: number;
}

interface SettingsRow {
  harvest_reminder_interval_minutes: number;
  transport_prep_alert_threshold_pct: number;
  product_suggestions?: string[] | null;
}

interface OrderRow {
  id: string;
  reference: string;
  product: string;
  quantity_kg: number;
  priority: OrderPriority;
  notes: string | null;
  status: Order['status'];
  created_by_name: string;
  created_at: string;
  allocated_at: string | null;
  harvest_started_at: string | null;
  completed_at: string | null;
}

interface AllocationRow {
  id: string;
  order_id: string;
  farm_id: string;
  farm_name_snapshot: string;
  allocated_qty_kg: number;
  harvest_status: FarmAllocation['harvestStatus'];
  current_progress_pct: number;
  harvest_started_at: string | null;
  harvest_completed_at: string | null;
  last_progress_at: string | null;
  last_reminder_at: string | null;
  prep_alert_sent: boolean;
  pickup_done: boolean;
  pickup_done_at: string | null;
  pickup_done_by_name: string | null;
  received_done: boolean;
  received_done_at: string | null;
  received_done_by_name: string | null;
}

interface ProgressEventRow {
  id: string;
  farm_allocation_id: string;
  previous_pct: number;
  new_pct: number;
  is_correction: boolean;
  reason: string | null;
  recorded_by_name: string;
  recorded_at: string;
}

interface NotificationRow {
  id: string;
  target_role: UserRole;
  type: AppNotification['type'];
  severity: AppNotification['severity'];
  title_key: string;
  message_key: string;
  params: Record<string, string | number> | null;
  order_id: string | null;
  allocation_id: string | null;
  created_at: string;
}

interface NotificationReadRow {
  notification_id: string;
}

interface OrderEventRow {
  id: string;
  order_id: string | null;
  order_ref: string | null;
  actor_name: string;
  actor_role: UserRole;
  action_key: string;
  params: Record<string, string | number> | null;
  occurred_at: string;
}

function mapProfile(row: ProfileRow): DemoUser {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    defaultLanguage: row.preferred_language === 'es' ? 'es' : 'fr',
    initials: computeInitials(row.full_name),
    isActive: row.is_active,
    passwordUpdatedAt: row.password_updated_at ?? undefined,
  };
}

export async function fetchOwnProfile(userId: string): Promise<DemoUser | null> {
  const client = requireClient();
  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, email, role, preferred_language, is_active, password_updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapProfile(data as ProfileRow);
}

export async function updateOwnLanguageInDb(userId: string, lang: Language): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('profiles')
    .update({ preferred_language: lang })
    .eq('id', userId);
  if (error) throw error;
}

export async function fetchWorkspaceSnapshot(currentUser: DemoUser): Promise<HarvestFlowState> {
  const client = requireClient();

  const [
    profilesRes,
    farmsRes,
    stepsRes,
    settingsRes,
    ordersRes,
    allocsRes,
    progressRes,
    notifsRes,
    readsRes,
    eventsRes,
  ] = await Promise.all([
    client
      .from('profiles')
      .select('id, full_name, email, role, preferred_language, is_active, password_updated_at')
      .order('created_at', { ascending: true }),
    client.from('farms').select('*').order('name', { ascending: true }),
    client.from('harvest_progress_steps').select('percentage').order('percentage', { ascending: true }),
    client
      .from('app_settings')
      .select('*')
      .eq('singleton', true)
      .maybeSingle(),
    client.from('orders').select('*').order('created_at', { ascending: false }).limit(200),
    client.from('farm_allocations').select('*'),
    client.from('harvest_progress_events').select('*').order('recorded_at', { ascending: true }),
    client.from('notifications').select('*').order('created_at', { ascending: false }).limit(150),
    client.from('notification_reads').select('notification_id').eq('user_id', currentUser.id),
    client.from('order_events').select('*').order('occurred_at', { ascending: false }).limit(200),
  ]);

  if (farmsRes.error) throw farmsRes.error;
  if (stepsRes.error) throw stepsRes.error;
  if (settingsRes.error) throw settingsRes.error;
  if (ordersRes.error) throw ordersRes.error;
  if (allocsRes.error) throw allocsRes.error;
  if (progressRes.error) throw progressRes.error;
  if (notifsRes.error) throw notifsRes.error;
  if (readsRes.error) throw readsRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const users: DemoUser[] =
    !profilesRes.error && profilesRes.data && profilesRes.data.length > 0
      ? (profilesRes.data as ProfileRow[]).map(mapProfile)
      : [currentUser];

  const farms: Farm[] = ((farmsRes.data ?? []) as FarmRow[]).map((f) => ({
    id: f.id,
    name: f.name,
    code: f.code ?? undefined,
    isActive: f.is_active,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  }));

  const stepList = ((stepsRes.data ?? []) as StepRow[]).map((s) => Number(s.percentage));
  const settingsRow = settingsRes.data as SettingsRow | null;
  const settings: HarvestSettings = {
    progressSteps: stepList.length > 0 ? stepList : [30, 50, 70, 100],
    reminderIntervalMinutes: settingsRow?.harvest_reminder_interval_minutes ?? 60,
    transportPrepThresholdPct: settingsRow?.transport_prep_alert_threshold_pct ?? 70,
    productSuggestions: Array.isArray(settingsRow?.product_suggestions)
      ? settingsRow.product_suggestions
      : [...PRODUCT_SUGGESTIONS],
  };

  const progressByAlloc = new Map<string, HarvestProgressRecord[]>();
  for (const ev of (progressRes.data ?? []) as ProgressEventRow[]) {
    const arr = progressByAlloc.get(ev.farm_allocation_id) ?? [];
    arr.push({
      id: ev.id,
      previousPct: ev.previous_pct,
      newPct: ev.new_pct,
      isCorrection: ev.is_correction,
      reason: ev.reason ?? undefined,
      recordedBy: ev.recorded_by_name,
      recordedAt: ev.recorded_at,
    });
    progressByAlloc.set(ev.farm_allocation_id, arr);
  }

  const allocsByOrder = new Map<string, FarmAllocation[]>();
  for (const row of (allocsRes.data ?? []) as AllocationRow[]) {
    const arr = allocsByOrder.get(row.order_id) ?? [];
    arr.push({
      id: row.id,
      orderId: row.order_id,
      farmId: row.farm_id,
      farmNameSnapshot: row.farm_name_snapshot,
      allocatedQtyKg: row.allocated_qty_kg,
      harvestStatus: row.harvest_status,
      currentProgressPct: row.current_progress_pct,
      harvestStartedAt: row.harvest_started_at ?? undefined,
      harvestCompletedAt: row.harvest_completed_at ?? undefined,
      lastProgressAt: row.last_progress_at ?? undefined,
      lastReminderAt: row.last_reminder_at ?? undefined,
      prepAlertSent: row.prep_alert_sent,
      pickupDone: row.pickup_done,
      pickupDoneAt: row.pickup_done_at ?? undefined,
      pickupDoneBy: row.pickup_done_by_name ?? undefined,
      receivedDone: row.received_done,
      receivedDoneAt: row.received_done_at ?? undefined,
      receivedDoneBy: row.received_done_by_name ?? undefined,
      progressHistory: progressByAlloc.get(row.id) ?? [],
    });
    allocsByOrder.set(row.order_id, arr);
  }

  const orders: Order[] = ((ordersRes.data ?? []) as OrderRow[]).map((o) => ({
    id: o.id,
    reference: o.reference,
    product: o.product,
    quantityKg: o.quantity_kg,
    priority: o.priority,
    notes: o.notes ?? undefined,
    status: o.status,
    createdBy: o.created_by_name,
    createdAt: o.created_at,
    allocatedAt: o.allocated_at ?? undefined,
    harvestStartedAt: o.harvest_started_at ?? undefined,
    completedAt: o.completed_at ?? undefined,
    allocations: allocsByOrder.get(o.id) ?? [],
  }));

  const readIds = new Set(
    ((readsRes.data ?? []) as NotificationReadRow[]).map((r) => r.notification_id),
  );

  const notifications: AppNotification[] = ((notifsRes.data ?? []) as NotificationRow[]).map((n) => ({
    id: n.id,
    targetRole: n.target_role,
    type: n.type,
    severity: n.severity,
    titleKey: n.title_key,
    messageKey: n.message_key,
    params: n.params ?? {},
    orderId: n.order_id ?? undefined,
    allocationId: n.allocation_id ?? undefined,
    isRead: readIds.has(n.id),
    createdAt: n.created_at,
  }));

  const history: HistoryEvent[] = ((eventsRes.data ?? []) as OrderEventRow[]).map((ev) => ({
    id: ev.id,
    orderId: ev.order_id ?? undefined,
    orderRef: ev.order_ref ?? undefined,
    actorName: ev.actor_name,
    actorRole: ev.actor_role,
    actionKey: ev.action_key,
    params: ev.params ?? {},
    occurredAt: ev.occurred_at,
  }));

  return {
    users,
    farms,
    settings,
    orders,
    notifications,
    history,
    nextOrderNumber: orders.length + 101,
  };
}

// ---- RPC Wrappers ----

export async function rpcCreateOrder(input: {
  product: string;
  quantityKg: number;
  priority: OrderPriority;
  notes?: string;
}): Promise<{ reference: string }> {
  const client = requireClient();
  const { data, error } = await client.rpc('rpc_create_order', {
    p_product: input.product,
    p_quantity_kg: input.quantityKg,
    p_priority: input.priority,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return { reference: (data as { reference: string }).reference };
}

export async function rpcSaveOrderAllocations(
  orderId: string,
  items: Array<{ farmId: string; allocatedQtyKg: number }>,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_save_order_allocations', {
    p_order_id: orderId,
    p_items: items,
  });
  if (error) throw error;
}

export async function rpcStartHarvesting(orderId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_start_harvesting', { p_order_id: orderId });
  if (error) throw error;
}

export async function rpcUpdateFarmProgress(
  orderId: string,
  allocationId: string,
  newPct: number,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_update_farm_progress', {
    p_order_id: orderId,
    p_allocation_id: allocationId,
    p_new_pct: newPct,
  });
  if (error) throw error;
}

export async function rpcCorrectFarmProgress(
  orderId: string,
  allocationId: string,
  correctedPct: number,
  reason?: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_correct_farm_progress', {
    p_order_id: orderId,
    p_allocation_id: allocationId,
    p_corrected_pct: correctedPct,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
}

export async function rpcTriggerActiveReminders(force = true): Promise<number> {
  const client = requireClient();
  const { data, error } = await client.rpc('rpc_trigger_active_reminders', { p_force: force });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function rpcConfirmPickupDone(orderId: string, allocationId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_confirm_pickup_done', {
    p_order_id: orderId,
    p_allocation_id: allocationId,
  });
  if (error) throw error;
}

export async function rpcConfirmWarehouseReceived(
  orderId: string,
  allocationId: string,
): Promise<boolean> {
  const client = requireClient();
  const { data, error } = await client.rpc('rpc_confirm_warehouse_received', {
    p_order_id: orderId,
    p_allocation_id: allocationId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function rpcAdminAddFarm(name: string, code?: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_admin_add_farm', {
    p_name: name,
    p_code: code ?? null,
  });
  if (error) throw error;
}

export async function rpcAdminUpdateFarm(
  farmId: string,
  name: string,
  code?: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_admin_update_farm', {
    p_farm_id: farmId,
    p_name: name,
    p_code: code ?? null,
  });
  if (error) throw error;
}

export async function rpcAdminToggleFarmActive(farmId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_admin_toggle_farm_active', { p_farm_id: farmId });
  if (error) throw error;
}

export async function rpcAdminUpdateHarvestSettings(settings: HarvestSettings): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_admin_update_harvest_settings', {
    p_steps: settings.progressSteps,
    p_reminder_interval: settings.reminderIntervalMinutes,
    p_prep_threshold: settings.transportPrepThresholdPct,
  });
  if (error) throw error;
}

export async function rpcAdminUpdateProductSuggestions(products: string[]): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_admin_update_product_suggestions', {
    p_products: products,
  });
  if (error) throw error;
}

export async function rpcMarkNotificationRead(id: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_mark_notification_read', { p_notification_id: id });
  if (error) throw error;
}

export async function rpcMarkAllNotificationsRead(): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_mark_all_notifications_read');
  if (error) throw error;
}

export async function rpcUpsertPushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_upsert_push_subscription', {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_user_agent: input.userAgent ?? null,
  });
  if (error) throw error;
}

export async function rpcDeactivatePushSubscription(endpoint: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc('rpc_deactivate_push_subscription', {
    p_endpoint: endpoint,
  });
  if (error) throw error;
}

// ---- Admin User Management Edge Function Wrappers ----

export async function invokeAdminManageUsers(payload: Record<string, unknown>): Promise<void> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke('admin-manage-users', {
    body: payload,
  });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }
}
