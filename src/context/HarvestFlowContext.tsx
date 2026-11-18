import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  canPerform,
  type DepartmentKey,
  type NavTabId,
  type Permission,
} from '../auth/permissions';
import { createInitialSeedState, INITIAL_USERS } from '../data/seed';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  fetchOwnProfile,
  fetchWorkspaceSnapshot,
  invokeAdminManageUsers,
  rpcAdminAddFarm,
  rpcAdminToggleFarmActive,
  rpcAdminUpdateFarm,
  rpcAdminUpdateHarvestSettings,
  rpcConfirmPickupDone,
  rpcConfirmWarehouseReceived,
  rpcCorrectFarmProgress,
  rpcCreateOrder,
  rpcMarkAllNotificationsRead,
  rpcMarkNotificationRead,
  rpcSaveOrderAllocations,
  rpcStartHarvesting,
  rpcTriggerActiveReminders,
  rpcUpdateFarmProgress,
  updateOwnLanguageInDb,
} from '../services/supabaseApi';
import type {
  AppNotification,
  DemoUser,
  Farm,
  FarmAllocation,
  HarvestFlowState,
  HarvestSettings,
  HistoryEvent,
  Language,
  Order,
  OrderPriority,
  UserRole,
} from '../types/domain';
import { makeId } from '../utils/format';

const STORAGE_KEY = 'harvestflow_v1_prototype_state';
const SESSION_STORAGE_KEY = 'harvestflow_v1_demo_session';
const LANG_PREFS_STORAGE_KEY = 'harvestflow_v1_user_languages';

interface CreateOrderInput {
  product: string;
  quantityKg: number;
  priority: OrderPriority;
  notes?: string;
}

interface AllocationDraftItem {
  farmId: string;
  allocatedQtyKg: number;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: UserRole;
  defaultLanguage: Language;
  password: string;
}

export interface UpdateUserInput {
  name: string;
  email: string;
  role: UserRole;
  defaultLanguage: Language;
  newPassword?: string;
}

export interface ActionResult {
  ok: boolean;
  errorKey?: string;
  errorMessage?: string;
}

interface ToastMessage {
  id: string;
  text: string;
  tone: 'success' | 'info' | 'warning' | 'urgent';
}

interface DemoSession {
  userId: string;
}

const EMPTY_SUPABASE_STATE: HarvestFlowState = {
  users: [],
  farms: [],
  settings: {
    progressSteps: [30, 50, 70, 100],
    reminderIntervalMinutes: 60,
    transportPrepThresholdPct: 70,
  },
  orders: [],
  notifications: [],
  history: [],
  nextOrderNumber: 101,
};

interface HarvestFlowContextValue {
  backendMode: 'supabase' | 'demo';
  authLoading: boolean;
  state: HarvestFlowState;
  isAuthenticated: boolean;
  currentRole: UserRole;
  currentUser: DemoUser;
  language: Language;
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;
  adminDepartment: DepartmentKey;
  setAdminDepartment: (dept: DepartmentKey) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  reminderPopupNotifications: AppNotification[];
  dismissReminderPopup: (notificationId?: string) => void;
  signInWithPassword: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signInAsUser: (userId: string, showToast?: boolean) => void;
  signOut: () => void;
  switchDemoRole: (role: UserRole) => void;
  setLanguage: (lang: Language) => void;
  getUserSavedLanguage: (user: DemoUser) => Language;
  hasPermission: (permission: Permission) => boolean;
  createOrder: (input: CreateOrderInput) => void;
  saveOrderAllocations: (orderId: string, items: AllocationDraftItem[]) => void;
  startHarvesting: (orderId: string) => void;
  updateFarmProgress: (orderId: string, allocationId: string, newPct: number) => void;
  correctFarmProgress: (
    orderId: string,
    allocationId: string,
    correctedPct: number,
    reason?: string,
  ) => void;
  triggerActiveReminders: () => void;
  confirmPickupDone: (orderId: string, allocationId: string) => void;
  confirmWarehouseReceived: (orderId: string, allocationId: string) => void;
  addFarm: (name: string, code?: string) => Promise<ActionResult>;
  updateFarm: (farmId: string, name: string, code?: string) => Promise<ActionResult>;
  toggleFarmActive: (farmId: string) => void;
  updateHarvestSettings: (settings: HarvestSettings) => void;
  addUser: (input: CreateUserInput) => Promise<ActionResult>;
  updateUser: (userId: string, input: UpdateUserInput) => Promise<ActionResult>;
  toggleUserActive: (userId: string) => Promise<ActionResult>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (role: UserRole | 'all') => void;
  getFarmName: (farmId: string, fallbackSnapshot: string) => string;
  getFarmUsageCount: (farmId: string) => number;
  resetDemoData: () => void;
}

const HarvestFlowContext = createContext<HarvestFlowContextValue | null>(null);

function computeInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function loadDemoState(): HarvestFlowState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HarvestFlowState>;
      if (parsed && Array.isArray(parsed.orders) && Array.isArray(parsed.farms) && parsed.settings) {
        const users =
          Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : INITIAL_USERS;
        return {
          ...createInitialSeedState(),
          ...parsed,
          users,
        };
      }
    }
  } catch {
    // Fallback to seed
  }
  return createInitialSeedState();
}

function loadDemoSession(users: DemoUser[]): DemoSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw === 'logged_out') return null;
    if (raw) {
      const parsed = JSON.parse(raw) as { userId?: string; role?: UserRole };
      if (parsed.userId && users.some((u) => u.id === parsed.userId && u.isActive)) {
        return { userId: parsed.userId };
      }
      if (parsed.role) {
        const byRole = users.find((u) => u.role === parsed.role && u.isActive);
        if (byRole) return { userId: byRole.id };
      }
    }
  } catch {
    // Fallback
  }
  const fallback = users.find((u) => u.isActive) ?? INITIAL_USERS[0];
  return { userId: fallback.id };
}

function loadUserLanguages(): Record<string, Language> {
  try {
    const raw = localStorage.getItem(LANG_PREFS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Record<string, Language>;
    }
  } catch {
    // Fallback
  }
  return {};
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export function HarvestFlowProvider({ children }: { children: React.ReactNode }) {
  const { i18n, t } = useTranslation();
  const backendMode: 'supabase' | 'demo' = isSupabaseConfigured ? 'supabase' : 'demo';

  const [state, setState] = useState<HarvestFlowState>(() =>
    backendMode === 'supabase' ? EMPTY_SUPABASE_STATE : loadDemoState(),
  );
  const [authLoading, setAuthLoading] = useState<boolean>(backendMode === 'supabase');
  const [supabaseUser, setSupabaseUser] = useState<DemoUser | null>(null);
  const [demoSession, setDemoSession] = useState<DemoSession | null>(() =>
    backendMode === 'demo' ? loadDemoSession(loadDemoState().users) : null,
  );
  const [userLanguages, setUserLanguages] = useState<Record<string, Language>>(() =>
    loadUserLanguages(),
  );
  const [activeTab, setActiveTabState] = useState<NavTabId>('dashboard');
  const [adminDepartment, setAdminDepartmentState] = useState<DepartmentKey>('commercial');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [reminderPopupNotifications, setReminderPopupNotifications] = useState<AppNotification[]>(
    [],
  );

  const supabaseUserRef = useRef<DemoUser | null>(null);
  supabaseUserRef.current = supabaseUser;
  const seenNotificationIdsRef = useRef<Set<string> | null>(null);
  const lastTrackedUserIdRef = useRef<string | null>(null);

  const resolvedUser =
    backendMode === 'supabase'
      ? supabaseUser
      : (demoSession && state.users.find((u) => u.id === demoSession.userId && u.isActive)) || null;

  const isAuthenticated = resolvedUser !== null;
  const currentUser: DemoUser = resolvedUser ?? state.users[0] ?? INITIAL_USERS[0];
  const currentRole: UserRole = currentUser.role;

  const getUserSavedLanguage = (user: DemoUser): Language => {
    if (backendMode === 'supabase') {
      return userLanguages[user.id] ?? user.defaultLanguage;
    }
    return userLanguages[user.id] ?? user.defaultLanguage;
  };

  const language: Language = isAuthenticated
    ? getUserSavedLanguage(currentUser)
    : (userLanguages.__guest ?? 'fr');

  const pushToast = useCallback(
    (text: string, tone: ToastMessage['tone'] = 'success', durationMs = 4500) => {
      const id = makeId('toast');
      setToasts((prev) => [...prev, { id, text, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, durationMs);
    },
    [],
  );

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  const dismissReminderPopup = (notificationId?: string) => {
    if (!notificationId) {
      setReminderPopupNotifications([]);
      return;
    }
    setReminderPopupNotifications((prev) => prev.filter((item) => item.id !== notificationId));
  };

  // Detect newly arrived notifications (from Realtime, pg_cron, or timer) and surface live popups
  useEffect(() => {
    if (!isAuthenticated || authLoading) {
      seenNotificationIdsRef.current = null;
      lastTrackedUserIdRef.current = null;
      setReminderPopupNotifications([]);
      return;
    }

    // Reset baseline when switching signed-in user so old unread alerts don't spam on login
    if (lastTrackedUserIdRef.current !== currentUser.id) {
      lastTrackedUserIdRef.current = currentUser.id;
      seenNotificationIdsRef.current = new Set(state.notifications.map((n) => n.id));
      setReminderPopupNotifications([]);
      return;
    }

    const seen = seenNotificationIdsRef.current;
    if (!seen) {
      seenNotificationIdsRef.current = new Set(state.notifications.map((n) => n.id));
      return;
    }

    const incoming = state.notifications.filter((n) => !seen.has(n.id));
    if (incoming.length === 0) return;

    for (const n of incoming) {
      seen.add(n.id);
    }

    if (currentRole === 'viewer') return;

    const relevant = incoming.filter((n) => !n.isRead && n.targetRole === currentRole);
    if (relevant.length === 0) return;

    const reminders = relevant.filter((n) => n.type === 'harvest_reminder');
    const others = relevant.filter((n) => n.type !== 'harvest_reminder');

    if (reminders.length > 0 && currentRole === 'farm_coordinator') {
      setReminderPopupNotifications((prev) => {
        const existingIds = new Set(prev.map((x) => x.id));
        const merged = [...reminders.filter((r) => !existingIds.has(r.id)), ...prev];
        return merged.slice(0, 6);
      });
    }

    for (const notif of others.slice(0, 3)) {
      const title = t(notif.titleKey, notif.params);
      const body = t(notif.messageKey, notif.params);
      const tone: ToastMessage['tone'] =
        notif.severity === 'urgent'
          ? 'urgent'
          : notif.severity === 'warning'
            ? 'warning'
            : notif.severity === 'success'
              ? 'success'
              : 'info';
      pushToast(`${title} — ${body}`, tone, 6500);
    }
  }, [isAuthenticated, authLoading, currentUser.id, currentRole, state.notifications, pushToast, t]);

  // Sync i18next & <html lang>
  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
    document.documentElement.lang = language;
  }, [i18n, language]);

  // Refresh live Supabase workspace snapshot
  const refreshSupabaseData = useCallback(async (profileOverride?: DemoUser) => {
    const activeProfile = profileOverride ?? supabaseUserRef.current;
    if (!activeProfile) return;
    try {
      const snapshot = await fetchWorkspaceSnapshot(activeProfile);
      setState(snapshot);
      // Keep current profile synced if admin edited it
      const freshSelf = snapshot.users.find((u) => u.id === activeProfile.id);
      if (freshSelf) {
        if (!freshSelf.isActive && supabase) {
          await supabase.auth.signOut();
          setSupabaseUser(null);
          return;
        }
        setSupabaseUser(freshSelf);
      }
    } catch (err) {
      pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning');
    }
  }, [pushToast, t]);

  // Initialize Supabase Auth listener & Realtime subscription when configured
  useEffect(() => {
    const client = supabase;
    if (backendMode !== 'supabase' || !client) return;

    let mounted = true;
    const loadSessionProfile = async (userId: string | null) => {
      if (!userId) {
        if (mounted) {
          setSupabaseUser(null);
          setState(EMPTY_SUPABASE_STATE);
          setAuthLoading(false);
        }
        return;
      }

      try {
        const profile = await fetchOwnProfile(userId);
        if (!mounted) return;
        if (!profile || !profile.isActive) {
          await client.auth.signOut();
          setSupabaseUser(null);
          setState(EMPTY_SUPABASE_STATE);
          setAuthLoading(false);
          return;
        }
        setSupabaseUser(profile);
        setUserLanguages((prev) => ({ ...prev, [profile.id]: profile.defaultLanguage }));
        await refreshSupabaseData(profile);
      } catch (err) {
        if (mounted) {
          pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning');
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    void client.auth.getSession().then(({ data }) => {
      void loadSessionProfile(data.session?.user.id ?? null);
    });

    const { data: authSub } = client.auth.onAuthStateChange((_event, nextSession) => {
      void loadSessionProfile(nextSession?.user.id ?? null);
    });

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, [backendMode, pushToast, refreshSupabaseData, t]);

  // Supabase Realtime sync across devices
  useEffect(() => {
    const client = supabase;
    if (backendMode !== 'supabase' || !client || !supabaseUser) return;

    let debounceTimer: number | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void refreshSupabaseData();
      }, 250);
    };

    const channel = client
      .channel('harvestflow-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'farm_allocations' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'farms' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'harvest_progress_steps' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_events' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      void client.removeChannel(channel);
    };
  }, [backendMode, supabaseUser?.id, refreshSupabaseData]);

  // Demo mode localStorage persistence
  useEffect(() => {
    if (backendMode !== 'demo') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore
    }
  }, [backendMode, state]);

  useEffect(() => {
    if (backendMode !== 'demo') return;
    try {
      if (demoSession) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(demoSession));
      } else {
        localStorage.setItem(SESSION_STORAGE_KEY, 'logged_out');
      }
    } catch {
      // Ignore
    }
  }, [backendMode, demoSession]);

  useEffect(() => {
    try {
      localStorage.setItem(LANG_PREFS_STORAGE_KEY, JSON.stringify(userLanguages));
    } catch {
      // Ignore
    }
  }, [userLanguages]);

  // Demo mode periodic reminder timer
  useEffect(() => {
    if (backendMode !== 'demo') return;
    const timer = window.setInterval(() => {
      const nowMs = Date.now();
      const intervalMs = state.settings.reminderIntervalMinutes * 60_000;
      const dueItems: Array<{ order: Order; alloc: FarmAllocation }> = [];

      for (const order of state.orders) {
        if (order.status !== 'in_progress') continue;
        for (const alloc of order.allocations) {
          if (alloc.harvestStatus !== 'in_progress' || alloc.currentProgressPct >= 100) continue;
          const refTime = alloc.lastReminderAt ?? alloc.harvestStartedAt;
          if (!refTime) continue;
          if (nowMs - new Date(refTime).getTime() >= intervalMs) {
            dueItems.push({ order, alloc });
          }
        }
      }

      if (dueItems.length === 0) return;

      const nowIso = new Date(nowMs).toISOString();
      const dueIds = new Set(dueItems.map((d) => d.alloc.id));

      setState((prev) => {
        const farmsById = new Map(prev.farms.map((f) => [f.id, f.name]));
        const newNotifs: AppNotification[] = dueItems.map(({ order, alloc }) => ({
          id: makeId('notif'),
          targetRole: 'farm_coordinator',
          type: 'harvest_reminder',
          severity: order.priority === 'urgent' ? 'urgent' : 'warning',
          titleKey: 'notifications.types.harvest_reminder_title',
          messageKey: 'notifications.types.harvest_reminder_body',
          params: {
            ref: order.reference,
            farm: farmsById.get(alloc.farmId) ?? alloc.farmNameSnapshot,
            pct: alloc.currentProgressPct,
          },
          orderId: order.id,
          allocationId: alloc.id,
          isRead: false,
          createdAt: nowIso,
        }));

        return {
          ...prev,
          orders: prev.orders.map((o) =>
            o.status !== 'in_progress'
              ? o
              : {
                  ...o,
                  allocations: o.allocations.map((a) =>
                    dueIds.has(a.id) ? { ...a, lastReminderAt: nowIso } : a,
                  ),
                },
          ),
          notifications: [...newNotifs, ...prev.notifications],
        };
      });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [backendMode, state.orders, state.settings.reminderIntervalMinutes]);

  const setLanguage = (lang: Language) => {
    const key = isAuthenticated ? currentUser.id : '__guest';
    setUserLanguages((prev) => ({ ...prev, [key]: lang }));

    if (backendMode === 'supabase' && isAuthenticated) {
      void updateOwnLanguageInDb(currentUser.id, lang).catch(() => {
        // Keep local language active even if offline
      });
    }
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!isAuthenticated) return false;
    return canPerform(currentRole, permission);
  };

  const guardPermission = (permission: Permission): boolean => {
    if (hasPermission(permission)) return true;
    pushToast(t('app.unauthorizedAction'), 'warning');
    return false;
  };

  const setActiveTab = (tab: NavTabId) => {
    if ((tab === 'departments' || tab === 'management') && currentRole !== 'admin') {
      setActiveTabState('dashboard');
      return;
    }
    if (tab === 'notifications' && currentRole === 'viewer') {
      setActiveTabState('dashboard');
      return;
    }
    setActiveTabState(tab);
  };

  const setAdminDepartment = (dept: DepartmentKey) => {
    if (!guardPermission('admin.switch_departments')) return;
    setAdminDepartmentState(dept);
  };

  const signInWithPassword = async (
    email: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) return { ok: false, error: 'Supabase not configured' };
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.user) {
      return { ok: false, error: t('auth.invalidCredentials') };
    }
    try {
      const profile = await fetchOwnProfile(data.user.id);
      if (!profile || !profile.isActive) {
        await supabase.auth.signOut();
        return { ok: false, error: t('auth.accountInactive') };
      }
      setActiveTabState('dashboard');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: extractErrorMessage(err) };
    }
  };

  const signInAsUser = (userId: string, showToast = true) => {
    if (backendMode !== 'demo') return;
    const user = state.users.find((u) => u.id === userId && u.isActive);
    if (!user) return;
    setDemoSession({ userId: user.id });
    setActiveTabState('dashboard');
    if (showToast) {
      pushToast(t('auth.signedInToast', { name: user.name, role: t(`roles.${user.role}`) }), 'info');
    }
  };

  const switchDemoRole = (role: UserRole) => {
    if (backendMode !== 'demo') return;
    const match = state.users.find((u) => u.role === role && u.isActive);
    if (!match) return;
    setDemoSession({ userId: match.id });
    setActiveTabState('dashboard');
  };

  const signOut = () => {
    setActiveTabState('dashboard');
    if (backendMode === 'supabase' && supabase) {
      void supabase.auth.signOut().then(() => {
        setSupabaseUser(null);
        setState(EMPTY_SUPABASE_STATE);
        pushToast(t('auth.signedOutToast'), 'info');
      });
      return;
    }
    setDemoSession(null);
    pushToast(t('auth.signedOutToast'), 'info');
  };

  const getFarmName = (farmId: string, fallbackSnapshot: string): string => {
    return state.farms.find((f) => f.id === farmId)?.name ?? fallbackSnapshot;
  };

  const getFarmUsageCount = (farmId: string): number => {
    return state.orders.filter((order) => order.allocations.some((a) => a.farmId === farmId)).length;
  };

  // ---- Operational Mutations ----

  const createOrder = (input: CreateOrderInput) => {
    if (!guardPermission('order.create')) return;

    if (backendMode === 'supabase') {
      void rpcCreateOrder(input)
        .then(({ reference }) => {
          pushToast(t('commercial.createdSuccess', { ref: reference }), 'success');
          return refreshSupabaseData();
        })
        .catch((err) => pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning'));
      return;
    }

    const now = new Date().toISOString();
    const reference = `CMD-${state.nextOrderNumber}`;
    const newOrder: Order = {
      id: makeId('ord'),
      reference,
      product: input.product.trim(),
      quantityKg: input.quantityKg,
      priority: input.priority,
      notes: input.notes?.trim() || undefined,
      status: 'pending_allocation',
      createdBy: currentUser.name,
      createdAt: now,
      allocations: [],
    };

    const notif: AppNotification = {
      id: makeId('notif'),
      targetRole: 'farm_coordinator',
      type: 'new_order',
      severity: input.priority === 'urgent' ? 'urgent' : 'info',
      titleKey: 'notifications.types.new_order_title',
      messageKey: 'notifications.types.new_order_body',
      params: {
        ref: reference,
        qty: input.quantityKg,
        product: newOrder.product,
        priority: input.priority === 'urgent' ? 'Urgent' : 'Normal',
      },
      orderId: newOrder.id,
      isRead: false,
      createdAt: now,
    };

    const hist: HistoryEvent = {
      id: makeId('hist'),
      orderId: newOrder.id,
      orderRef: reference,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionKey: 'history.actions.order_created',
      params: {
        qty: input.quantityKg,
        product: newOrder.product,
        priority: input.priority === 'urgent' ? 'Urgent' : 'Normal',
      },
      occurredAt: now,
    };

    setState((prev) => ({
      ...prev,
      nextOrderNumber: prev.nextOrderNumber + 1,
      orders: [newOrder, ...prev.orders],
      notifications: [notif, ...prev.notifications],
      history: [hist, ...prev.history],
    }));

    pushToast(t('commercial.createdSuccess', { ref: reference }), 'success');
  };

  const saveOrderAllocations = (orderId: string, items: AllocationDraftItem[]) => {
    if (!guardPermission('harvest.allocate')) return;

    if (backendMode === 'supabase') {
      void rpcSaveOrderAllocations(orderId, items)
        .then(() => refreshSupabaseData())
        .catch((err) => pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning'));
      return;
    }

    const now = new Date().toISOString();
    setState((prev) => {
      const target = prev.orders.find((o) => o.id === orderId);
      if (!target || target.status === 'in_progress' || target.status === 'completed') {
        return prev;
      }

      const activeFarmsById = new Map(prev.farms.filter((f) => f.isActive).map((f) => [f.id, f]));
      const allocations: FarmAllocation[] = items
        .filter((item) => item.allocatedQtyKg > 0 && activeFarmsById.has(item.farmId))
        .map((item) => {
          const farm = activeFarmsById.get(item.farmId)!;
          return {
            id: makeId('alloc'),
            orderId,
            farmId: farm.id,
            farmNameSnapshot: farm.name,
            allocatedQtyKg: item.allocatedQtyKg,
            harvestStatus: 'pending',
            currentProgressPct: 0,
            prepAlertSent: false,
            pickupDone: false,
            receivedDone: false,
            progressHistory: [],
          };
        });

      if (allocations.length === 0) return prev;

      const summary = allocations.map((a) => `${a.farmNameSnapshot} (${a.allocatedQtyKg} kg)`).join(', ');

      const hist: HistoryEvent = {
        id: makeId('hist'),
        orderId,
        orderRef: target.reference,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionKey: 'history.actions.farms_allocated',
        params: { summary },
        occurredAt: now,
      };

      return {
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === orderId ? { ...o, status: 'allocated', allocatedAt: now, allocations } : o,
        ),
        history: [hist, ...prev.history],
      };
    });
  };

  const startHarvesting = (orderId: string) => {
    if (!guardPermission('harvest.start')) return;
    const targetOrder = state.orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    if (backendMode === 'supabase') {
      void rpcStartHarvesting(orderId)
        .then(() => {
          pushToast(t('harvest.harvestStartedToast', { ref: targetOrder.reference }), 'success');
          return refreshSupabaseData();
        })
        .catch((err) => pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning'));
      return;
    }

    const now = new Date().toISOString();
    if (targetOrder.status !== 'allocated' || targetOrder.allocations.length === 0) return;

    const notif: AppNotification = {
      id: makeId('notif'),
      targetRole: 'transport',
      type: 'harvest_started',
      severity: targetOrder.priority === 'urgent' ? 'urgent' : 'info',
      titleKey: 'notifications.types.harvest_started_title',
      messageKey: 'notifications.types.harvest_started_body',
      params: {
        ref: targetOrder.reference,
        farmsCount: targetOrder.allocations.length,
        qty: targetOrder.quantityKg,
        product: targetOrder.product,
      },
      orderId,
      isRead: false,
      createdAt: now,
    };

    const hist: HistoryEvent = {
      id: makeId('hist'),
      orderId,
      orderRef: targetOrder.reference,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionKey: 'history.actions.harvest_started',
      params: { interval: state.settings.reminderIntervalMinutes },
      occurredAt: now,
    };

    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'in_progress',
              harvestStartedAt: now,
              allocations: o.allocations.map((a) => ({
                ...a,
                harvestStatus: 'in_progress',
                harvestStartedAt: now,
                lastReminderAt: now,
              })),
            }
          : o,
      ),
      notifications: [notif, ...prev.notifications],
      history: [hist, ...prev.history],
    }));

    pushToast(t('harvest.harvestStartedToast', { ref: targetOrder.reference }), 'success');
  };

  const updateFarmProgress = (orderId: string, allocationId: string, newPct: number) => {
    if (!guardPermission('harvest.update_progress')) return;
    const order = state.orders.find((o) => o.id === orderId);
    const alloc = order?.allocations.find((a) => a.id === allocationId);
    if (!order || !alloc || alloc.harvestStatus !== 'in_progress') return;
    if (newPct <= alloc.currentProgressPct) return;
    const farmName = getFarmName(alloc.farmId, alloc.farmNameSnapshot);

    if (backendMode === 'supabase') {
      void rpcUpdateFarmProgress(orderId, allocationId, newPct)
        .then(() => {
          pushToast(t('harvest.progressUpdatedToast', { farm: farmName, pct: newPct }), 'success');
          return refreshSupabaseData();
        })
        .catch((err) => pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning'));
      return;
    }

    const now = new Date().toISOString();
    const prevPct = alloc.currentProgressPct;
    const isNowComplete = newPct >= 100;
    const crossedPrepThreshold =
      !isNowComplete &&
      !alloc.prepAlertSent &&
      newPct >= state.settings.transportPrepThresholdPct;

    const newNotifications: AppNotification[] = [];
    const newHistory: HistoryEvent[] = [
      {
        id: makeId('hist'),
        orderId: order.id,
        orderRef: order.reference,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionKey: 'history.actions.progress_updated',
        params: { farm: farmName, prev: prevPct, next: newPct },
        occurredAt: now,
      },
    ];

    if (crossedPrepThreshold) {
      newNotifications.push({
        id: makeId('notif'),
        targetRole: 'transport',
        type: 'transport_prep',
        severity: order.priority === 'urgent' ? 'urgent' : 'warning',
        titleKey: 'notifications.types.transport_prep_title',
        messageKey: 'notifications.types.transport_prep_body',
        params: {
          ref: order.reference,
          farm: farmName,
          pct: newPct,
          qty: alloc.allocatedQtyKg,
          product: order.product,
        },
        orderId: order.id,
        allocationId: alloc.id,
        isRead: false,
        createdAt: now,
      });
    }

    if (isNowComplete) {
      newNotifications.push({
        id: makeId('notif'),
        targetRole: 'transport',
        type: 'harvest_ready',
        severity: order.priority === 'urgent' ? 'urgent' : 'success',
        titleKey: 'notifications.types.harvest_ready_title',
        messageKey: 'notifications.types.harvest_ready_body',
        params: {
          ref: order.reference,
          farm: farmName,
          qty: alloc.allocatedQtyKg,
          product: order.product,
        },
        orderId: order.id,
        allocationId: alloc.id,
        isRead: false,
        createdAt: now,
      });

      newHistory.unshift({
        id: makeId('hist'),
        orderId: order.id,
        orderRef: order.reference,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionKey: 'history.actions.harvest_completed',
        params: { farm: farmName },
        occurredAt: now,
      });
    }

    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              allocations: o.allocations.map((a) =>
                a.id === allocationId
                  ? {
                      ...a,
                      currentProgressPct: newPct,
                      harvestStatus: isNowComplete ? 'completed' : 'in_progress',
                      harvestCompletedAt: isNowComplete ? now : a.harvestCompletedAt,
                      lastProgressAt: now,
                      prepAlertSent: a.prepAlertSent || crossedPrepThreshold || isNowComplete,
                      progressHistory: [
                        ...a.progressHistory,
                        {
                          id: makeId('pr'),
                          previousPct: prevPct,
                          newPct,
                          recordedBy: currentUser.name,
                          recordedAt: now,
                        },
                      ],
                    }
                  : a,
              ),
            }
          : o,
      ),
      notifications: [...newNotifications, ...prev.notifications],
      history: [...newHistory, ...prev.history],
    }));

    pushToast(t('harvest.progressUpdatedToast', { farm: farmName, pct: newPct }), 'success');
  };

  const correctFarmProgress = (
    orderId: string,
    allocationId: string,
    correctedPct: number,
    reason?: string,
  ) => {
    if (!guardPermission('harvest.update_progress')) return;
    const order = state.orders.find((o) => o.id === orderId);
    const alloc = order?.allocations.find((a) => a.id === allocationId);
    if (
      !order ||
      !alloc ||
      alloc.harvestStatus !== 'in_progress' ||
      alloc.currentProgressPct >= 100 ||
      alloc.pickupDone ||
      alloc.receivedDone ||
      correctedPct >= alloc.currentProgressPct
    ) {
      return;
    }

    const farmName = getFarmName(alloc.farmId, alloc.farmNameSnapshot);
    const prevPct = alloc.currentProgressPct;
    const cleanReason = reason?.trim() || undefined;

    if (backendMode === 'supabase') {
      void rpcCorrectFarmProgress(orderId, allocationId, correctedPct, cleanReason)
        .then(() => {
          pushToast(
            t('harvest.progressCorrectedToast', { farm: farmName, prev: prevPct, pct: correctedPct }),
            'info',
          );
          return refreshSupabaseData();
        })
        .catch((err) =>
          pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning'),
        );
      return;
    }

    const now = new Date().toISOString();
    const threshold = state.settings.transportPrepThresholdPct;
    const affectsTransportPrep = alloc.prepAlertSent || prevPct >= threshold;
    const dropsBelowThreshold = correctedPct < threshold;

    const newNotifications: AppNotification[] = affectsTransportPrep
      ? [
          {
            id: makeId('notif'),
            targetRole: 'transport',
            type: 'transport_prep_corrected',
            severity: order.priority === 'urgent' ? 'urgent' : 'warning',
            titleKey: 'notifications.types.transport_prep_corrected_title',
            messageKey: 'notifications.types.transport_prep_corrected_body',
            params: {
              ref: order.reference,
              farm: farmName,
              prev: prevPct,
              pct: correctedPct,
              qty: alloc.allocatedQtyKg,
              product: order.product,
            },
            orderId: order.id,
            allocationId: alloc.id,
            isRead: false,
            createdAt: now,
          },
        ]
      : [];

    const hist: HistoryEvent = {
      id: makeId('hist'),
      orderId: order.id,
      orderRef: order.reference,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionKey: cleanReason
        ? 'history.actions.progress_corrected_with_reason'
        : 'history.actions.progress_corrected',
      params: {
        farm: farmName,
        prev: prevPct,
        next: correctedPct,
        reason: cleanReason ?? '',
      },
      occurredAt: now,
    };

    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              allocations: o.allocations.map((a) =>
                a.id === allocationId
                  ? {
                      ...a,
                      currentProgressPct: correctedPct,
                      lastProgressAt: now,
                      prepAlertSent: dropsBelowThreshold ? false : a.prepAlertSent,
                      progressHistory: [
                        ...a.progressHistory,
                        {
                          id: makeId('pr'),
                          previousPct: prevPct,
                          newPct: correctedPct,
                          isCorrection: true,
                          reason: cleanReason,
                          recordedBy: currentUser.name,
                          recordedAt: now,
                        },
                      ],
                    }
                  : a,
              ),
            }
          : o,
      ),
      notifications: [...newNotifications, ...prev.notifications],
      history: [hist, ...prev.history],
    }));

    pushToast(
      t('harvest.progressCorrectedToast', { farm: farmName, prev: prevPct, pct: correctedPct }),
      'info',
    );
  };

  const triggerActiveReminders = () => {
    if (!guardPermission('harvest.trigger_reminders')) return;

    if (backendMode === 'supabase') {
      void rpcTriggerActiveReminders(true)
        .then((count) => {
          if (count === 0) {
            pushToast(t('harvest.noActiveForReminder'), 'info');
          } else {
            pushToast(t('harvest.reminderSentToast', { count }), 'warning');
          }
          return refreshSupabaseData();
        })
        .catch((err) => pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning'));
      return;
    }

    const now = new Date().toISOString();
    const activeItems: Array<{ order: Order; alloc: FarmAllocation }> = [];

    for (const order of state.orders) {
      if (order.status !== 'in_progress') continue;
      for (const alloc of order.allocations) {
        if (alloc.harvestStatus === 'in_progress' && alloc.currentProgressPct < 100) {
          activeItems.push({ order, alloc });
        }
      }
    }

    if (activeItems.length === 0) {
      pushToast(t('harvest.noActiveForReminder'), 'info');
      return;
    }

    const newNotifs: AppNotification[] = activeItems.map(({ order, alloc }) => ({
      id: makeId('notif'),
      targetRole: 'farm_coordinator',
      type: 'harvest_reminder',
      severity: order.priority === 'urgent' ? 'urgent' : 'warning',
      titleKey: 'notifications.types.harvest_reminder_title',
      messageKey: 'notifications.types.harvest_reminder_body',
      params: {
        ref: order.reference,
        farm: getFarmName(alloc.farmId, alloc.farmNameSnapshot),
        pct: alloc.currentProgressPct,
      },
      orderId: order.id,
      allocationId: alloc.id,
      isRead: false,
      createdAt: now,
    }));

    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.status !== 'in_progress'
          ? o
          : {
              ...o,
              allocations: o.allocations.map((a) =>
                a.harvestStatus === 'in_progress' && a.currentProgressPct < 100
                  ? { ...a, lastReminderAt: now }
                  : a,
              ),
            },
      ),
      notifications: [...newNotifs, ...prev.notifications],
    }));

    pushToast(t('harvest.reminderSentToast', { count: activeItems.length }), 'warning');
  };

  const confirmPickupDone = (orderId: string, allocationId: string) => {
    if (!guardPermission('transport.confirm_pickup')) return;
    const order = state.orders.find((o) => o.id === orderId);
    const alloc = order?.allocations.find((a) => a.id === allocationId);
    if (!order || !alloc || alloc.harvestStatus !== 'completed' || alloc.pickupDone) return;
    const farmName = getFarmName(alloc.farmId, alloc.farmNameSnapshot);

    if (backendMode === 'supabase') {
      void rpcConfirmPickupDone(orderId, allocationId)
        .then(() => {
          pushToast(t('transport.doneToast', { farm: farmName, ref: order.reference }), 'success');
          return refreshSupabaseData();
        })
        .catch((err) => pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning'));
      return;
    }

    const now = new Date().toISOString();
    const notif: AppNotification = {
      id: makeId('notif'),
      targetRole: 'warehouse',
      type: 'pickup_done',
      severity: order.priority === 'urgent' ? 'urgent' : 'info',
      titleKey: 'notifications.types.pickup_done_title',
      messageKey: 'notifications.types.pickup_done_body',
      params: {
        ref: order.reference,
        farm: farmName,
        qty: alloc.allocatedQtyKg,
        product: order.product,
      },
      orderId: order.id,
      allocationId: alloc.id,
      isRead: false,
      createdAt: now,
    };

    const hist: HistoryEvent = {
      id: makeId('hist'),
      orderId: order.id,
      orderRef: order.reference,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionKey: 'history.actions.pickup_confirmed',
      params: { farm: farmName },
      occurredAt: now,
    };

    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              allocations: o.allocations.map((a) =>
                a.id === allocationId
                  ? { ...a, pickupDone: true, pickupDoneAt: now, pickupDoneBy: currentUser.name }
                  : a,
              ),
            }
          : o,
      ),
      notifications: [notif, ...prev.notifications],
      history: [hist, ...prev.history],
    }));

    pushToast(t('transport.doneToast', { farm: farmName, ref: order.reference }), 'success');
  };

  const confirmWarehouseReceived = (orderId: string, allocationId: string) => {
    if (!guardPermission('warehouse.confirm_received')) return;
    const order = state.orders.find((o) => o.id === orderId);
    const alloc = order?.allocations.find((a) => a.id === allocationId);
    if (!order || !alloc || !alloc.pickupDone || alloc.receivedDone) return;
    const farmName = getFarmName(alloc.farmId, alloc.farmNameSnapshot);

    if (backendMode === 'supabase') {
      void rpcConfirmWarehouseReceived(orderId, allocationId)
        .then((orderCompleted) => {
          if (orderCompleted) {
            pushToast(t('warehouse.orderCompletedToast', { ref: order.reference }), 'success');
          } else {
            pushToast(t('warehouse.receivedToast', { farm: farmName, ref: order.reference }), 'success');
          }
          return refreshSupabaseData();
        })
        .catch((err) => pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning'));
      return;
    }

    const now = new Date().toISOString();
    const updatedAllocations = order.allocations.map((a) =>
      a.id === allocationId
        ? { ...a, receivedDone: true, receivedDoneAt: now, receivedDoneBy: currentUser.name }
        : a,
    );

    const allDone =
      updatedAllocations.length > 0 &&
      updatedAllocations.every((a) => a.harvestStatus === 'completed' && a.pickupDone && a.receivedDone);

    const newHistory: HistoryEvent[] = [
      {
        id: makeId('hist'),
        orderId: order.id,
        orderRef: order.reference,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionKey: 'history.actions.warehouse_received',
        params: { farm: farmName },
        occurredAt: now,
      },
    ];

    const newNotifs: AppNotification[] = [];

    if (allDone) {
      newHistory.unshift({
        id: makeId('hist'),
        orderId: order.id,
        orderRef: order.reference,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionKey: 'history.actions.order_completed',
        params: {},
        occurredAt: now,
      });

      const rolesToNotify: UserRole[] = ['commercial', 'admin'];
      for (const role of rolesToNotify) {
        newNotifs.push({
          id: makeId('notif'),
          targetRole: role,
          type: 'order_completed',
          severity: 'success',
          titleKey: 'notifications.types.order_completed_title',
          messageKey: 'notifications.types.order_completed_body',
          params: { ref: order.reference, product: order.product, qty: order.quantityKg },
          orderId: order.id,
          isRead: false,
          createdAt: now,
        });
      }
    }

    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: allDone ? 'completed' : o.status,
              completedAt: allDone ? now : o.completedAt,
              allocations: updatedAllocations,
            }
          : o,
      ),
      notifications: [...newNotifs, ...prev.notifications],
      history: [...newHistory, ...prev.history],
    }));

    if (allDone) {
      pushToast(t('warehouse.orderCompletedToast', { ref: order.reference }), 'success');
    } else {
      pushToast(t('warehouse.receivedToast', { farm: farmName, ref: order.reference }), 'success');
    }
  };

  // ---- Admin Farm & Settings Mutations ----

  const addFarm = async (name: string, code?: string): Promise<ActionResult> => {
    if (!guardPermission('admin.manage_farms')) return { ok: false };

    const cleanName = name.trim();
    const cleanCode = code?.trim() || undefined;
    if (!cleanName) return { ok: false, errorKey: 'admin.farmNameRequired' };

    const duplicate = state.farms.some(
      (f) =>
        f.name.toLowerCase() === cleanName.toLowerCase() ||
        (cleanCode && f.code && f.code.toLowerCase() === cleanCode.toLowerCase()),
    );
    if (duplicate) return { ok: false, errorKey: 'admin.farmDuplicateError' };

    if (backendMode === 'supabase') {
      try {
        await rpcAdminAddFarm(cleanName, cleanCode);
        pushToast(t('admin.farmAddedToast', { name: cleanName }), 'success');
        await refreshSupabaseData();
        return { ok: true };
      } catch (err) {
        return { ok: false, errorMessage: extractErrorMessage(err) };
      }
    }

    const now = new Date().toISOString();
    const farm: Farm = {
      id: makeId('farm'),
      name: cleanName,
      code: cleanCode,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const hist: HistoryEvent = {
      id: makeId('hist'),
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionKey: 'history.actions.admin_farm_created',
      params: { name: cleanName },
      occurredAt: now,
    };

    setState((prev) => ({
      ...prev,
      farms: [...prev.farms, farm],
      history: [hist, ...prev.history],
    }));

    pushToast(t('admin.farmAddedToast', { name: cleanName }), 'success');
    return { ok: true };
  };

  const updateFarm = async (farmId: string, name: string, code?: string): Promise<ActionResult> => {
    if (!guardPermission('admin.manage_farms')) return { ok: false };

    const cleanName = name.trim();
    const cleanCode = code?.trim() || undefined;
    if (!cleanName) return { ok: false, errorKey: 'admin.farmNameRequired' };

    const duplicate = state.farms.some(
      (f) =>
        f.id !== farmId &&
        (f.name.toLowerCase() === cleanName.toLowerCase() ||
          (cleanCode && f.code && f.code.toLowerCase() === cleanCode.toLowerCase())),
    );
    if (duplicate) return { ok: false, errorKey: 'admin.farmDuplicateError' };

    if (backendMode === 'supabase') {
      try {
        await rpcAdminUpdateFarm(farmId, cleanName, cleanCode);
        pushToast(t('admin.farmUpdatedToast'), 'success');
        await refreshSupabaseData();
        return { ok: true };
      } catch (err) {
        return { ok: false, errorMessage: extractErrorMessage(err) };
      }
    }

    const now = new Date().toISOString();
    const hist: HistoryEvent = {
      id: makeId('hist'),
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionKey: 'history.actions.admin_farm_updated',
      params: { name: cleanName },
      occurredAt: now,
    };

    setState((prev) => ({
      ...prev,
      farms: prev.farms.map((f) =>
        f.id === farmId ? { ...f, name: cleanName, code: cleanCode, updatedAt: now } : f,
      ),
      history: [hist, ...prev.history],
    }));

    pushToast(t('admin.farmUpdatedToast'), 'success');
    return { ok: true };
  };

  const toggleFarmActive = (farmId: string) => {
    if (!guardPermission('admin.manage_farms')) return;
    const target = state.farms.find((f) => f.id === farmId);
    if (!target) return;
    const nextActive = !target.isActive;
    const statusLabel = nextActive ? t('common.active').toLowerCase() : t('common.inactive').toLowerCase();

    if (backendMode === 'supabase') {
      void rpcAdminToggleFarmActive(farmId)
        .then(() => {
          pushToast(t('admin.farmStatusToast', { name: target.name, status: statusLabel }), 'info');
          return refreshSupabaseData();
        })
        .catch((err) => pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning'));
      return;
    }

    const now = new Date().toISOString();
    const hist: HistoryEvent = {
      id: makeId('hist'),
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionKey: 'history.actions.admin_farm_toggled',
      params: { name: target.name, status: statusLabel },
      occurredAt: now,
    };

    setState((prev) => ({
      ...prev,
      farms: prev.farms.map((f) =>
        f.id === farmId ? { ...f, isActive: nextActive, updatedAt: now } : f,
      ),
      history: [hist, ...prev.history],
    }));

    pushToast(t('admin.farmStatusToast', { name: target.name, status: statusLabel }), 'info');
  };

  const updateHarvestSettings = (nextSettings: HarvestSettings) => {
    if (!guardPermission('admin.manage_settings')) return;

    const cleanedSteps = Array.from(
      new Set([
        ...nextSettings.progressSteps.filter((n) => Number.isInteger(n) && n >= 1 && n <= 100),
        100,
      ]),
    ).sort((a, b) => a - b);

    const safeInterval = Math.min(1440, Math.max(5, Math.round(nextSettings.reminderIntervalMinutes)));
    const safeThreshold = Math.min(99, Math.max(1, Math.round(nextSettings.transportPrepThresholdPct)));

    const sanitized: HarvestSettings = {
      progressSteps: cleanedSteps,
      reminderIntervalMinutes: safeInterval,
      transportPrepThresholdPct: safeThreshold,
    };

    if (backendMode === 'supabase') {
      void rpcAdminUpdateHarvestSettings(sanitized)
        .then(() => {
          pushToast(t('admin.settingsSavedToast'), 'success');
          return refreshSupabaseData();
        })
        .catch((err) => pushToast(t('auth.serverError', { message: extractErrorMessage(err) }), 'warning'));
      return;
    }

    const now = new Date().toISOString();
    const hist: HistoryEvent = {
      id: makeId('hist'),
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionKey: 'history.actions.admin_settings_updated',
      params: {
        steps: cleanedSteps.map((s) => `${s}%`).join(', '),
        interval: safeInterval,
        threshold: safeThreshold,
      },
      occurredAt: now,
    };

    setState((prev) => ({
      ...prev,
      settings: sanitized,
      history: [hist, ...prev.history],
    }));

    pushToast(t('admin.settingsSavedToast'), 'success');
  };

  // ---- Admin User Management Mutations ----

  const addUser = async (input: CreateUserInput): Promise<ActionResult> => {
    if (!guardPermission('admin.manage_users')) return { ok: false };

    const cleanName = input.name.trim();
    const cleanEmail = input.email.trim().toLowerCase();
    if (!cleanName) return { ok: false, errorKey: 'admin.userNameRequired' };
    if (!cleanEmail || !cleanEmail.includes('@')) return { ok: false, errorKey: 'admin.userEmailRequired' };
    if (input.password.length < 6) return { ok: false, errorKey: 'admin.userPasswordTooShort' };

    const duplicate = state.users.some((u) => u.email.toLowerCase() === cleanEmail);
    if (duplicate) return { ok: false, errorKey: 'admin.userDuplicateEmail' };

    if (backendMode === 'supabase') {
      try {
        await invokeAdminManageUsers({
          action: 'create_user',
          name: cleanName,
          email: cleanEmail,
          role: input.role,
          defaultLanguage: input.defaultLanguage,
          password: input.password,
        });
        pushToast(t('admin.userAddedToast', { name: cleanName }), 'success');
        await refreshSupabaseData();
        return { ok: true };
      } catch (err) {
        return { ok: false, errorMessage: extractErrorMessage(err) };
      }
    }

    const now = new Date().toISOString();
    const newUser: DemoUser = {
      id: makeId('usr'),
      name: cleanName,
      email: cleanEmail,
      role: input.role,
      defaultLanguage: input.defaultLanguage,
      initials: computeInitials(cleanName),
      isActive: true,
      passwordUpdatedAt: now,
    };

    const hist: HistoryEvent = {
      id: makeId('hist'),
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionKey: 'history.actions.admin_user_created',
      params: { name: cleanName, role: t(`roles.${input.role}`) },
      occurredAt: now,
    };

    setState((prev) => ({
      ...prev,
      users: [...prev.users, newUser],
      history: [hist, ...prev.history],
    }));

    pushToast(t('admin.userAddedToast', { name: cleanName }), 'success');
    return { ok: true };
  };

  const updateUser = async (userId: string, input: UpdateUserInput): Promise<ActionResult> => {
    if (!guardPermission('admin.manage_users')) return { ok: false };

    const target = state.users.find((u) => u.id === userId);
    if (!target) return { ok: false };

    const cleanName = input.name.trim();
    const cleanEmail = input.email.trim().toLowerCase();
    if (!cleanName) return { ok: false, errorKey: 'admin.userNameRequired' };
    if (!cleanEmail || !cleanEmail.includes('@')) return { ok: false, errorKey: 'admin.userEmailRequired' };
    if (input.newPassword && input.newPassword.length < 6) {
      return { ok: false, errorKey: 'admin.userPasswordTooShort' };
    }
    if (userId === currentUser.id && input.role !== 'admin') {
      return { ok: false, errorKey: 'admin.userSelfProtected' };
    }

    const duplicate = state.users.some(
      (u) => u.id !== userId && u.email.toLowerCase() === cleanEmail,
    );
    if (duplicate) return { ok: false, errorKey: 'admin.userDuplicateEmail' };

    if (backendMode === 'supabase') {
      try {
        await invokeAdminManageUsers({
          action: 'update_user',
          userId,
          name: cleanName,
          email: cleanEmail,
          role: input.role,
          defaultLanguage: input.defaultLanguage,
          newPassword: input.newPassword,
        });
        pushToast(t('admin.userUpdatedToast', { name: cleanName }), 'success');
        await refreshSupabaseData();
        return { ok: true };
      } catch (err) {
        return { ok: false, errorMessage: extractErrorMessage(err) };
      }
    }

    const now = new Date().toISOString();
    const hist: HistoryEvent = {
      id: makeId('hist'),
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionKey: 'history.actions.admin_user_updated',
      params: { name: cleanName, role: t(`roles.${input.role}`) },
      occurredAt: now,
    };

    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === userId
          ? {
              ...u,
              name: cleanName,
              email: cleanEmail,
              role: input.role,
              defaultLanguage: input.defaultLanguage,
              initials: computeInitials(cleanName),
              passwordUpdatedAt: input.newPassword ? now : u.passwordUpdatedAt,
            }
          : u,
      ),
      history: [hist, ...prev.history],
    }));

    setUserLanguages((prev) => ({ ...prev, [userId]: input.defaultLanguage }));
    pushToast(t('admin.userUpdatedToast', { name: cleanName }), 'success');
    return { ok: true };
  };

  const toggleUserActive = async (userId: string): Promise<ActionResult> => {
    if (!guardPermission('admin.manage_users')) return { ok: false };

    if (userId === currentUser.id) {
      pushToast(t('admin.userSelfProtected'), 'warning');
      return { ok: false, errorKey: 'admin.userSelfProtected' };
    }

    const target = state.users.find((u) => u.id === userId);
    if (!target) return { ok: false };

    const nextActive = !target.isActive;
    const statusLabel = nextActive ? t('common.active').toLowerCase() : t('common.inactive').toLowerCase();

    if (backendMode === 'supabase') {
      try {
        await invokeAdminManageUsers({ action: 'toggle_active', userId });
        pushToast(t('admin.userStatusToast', { name: target.name, status: statusLabel }), 'info');
        await refreshSupabaseData();
        return { ok: true };
      } catch (err) {
        const message = extractErrorMessage(err);
        pushToast(t('auth.serverError', { message }), 'warning');
        return { ok: false, errorMessage: message };
      }
    }

    const now = new Date().toISOString();
    const hist: HistoryEvent = {
      id: makeId('hist'),
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionKey: 'history.actions.admin_user_toggled',
      params: { name: target.name, status: statusLabel },
      occurredAt: now,
    };

    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, isActive: nextActive } : u)),
      history: [hist, ...prev.history],
    }));

    pushToast(t('admin.userStatusToast', { name: target.name, status: statusLabel }), 'info');
    return { ok: true };
  };

  // ---- Notifications ----

  const markNotificationRead = (id: string) => {
    if (backendMode === 'supabase') {
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      }));
      void rpcMarkNotificationRead(id).catch(() => void refreshSupabaseData());
      return;
    }

    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    }));
  };

  const markAllNotificationsRead = (role: UserRole | 'all') => {
    if (backendMode === 'supabase') {
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) =>
          role === 'all' || n.targetRole === role ? { ...n, isRead: true } : n,
        ),
      }));
      void rpcMarkAllNotificationsRead().catch(() => void refreshSupabaseData());
      return;
    }

    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        role === 'all' || n.targetRole === role ? { ...n, isRead: true } : n,
      ),
    }));
  };

  const resetDemoData = () => {
    if (backendMode !== 'demo') return;
    const fresh = createInitialSeedState();
    setState(fresh);
    setUserLanguages({});
    setDemoSession({ userId: fresh.users[0].id });
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LANG_PREFS_STORAGE_KEY);
  };

  const value = useMemo<HarvestFlowContextValue>(
    () => ({
      backendMode,
      authLoading,
      state,
      isAuthenticated,
      currentRole,
      currentUser,
      language,
      activeTab,
      setActiveTab,
      adminDepartment,
      setAdminDepartment,
      toasts,
      dismissToast,
      reminderPopupNotifications,
      dismissReminderPopup,
      signInWithPassword,
      signInAsUser,
      signOut,
      switchDemoRole,
      setLanguage,
      getUserSavedLanguage,
      hasPermission,
      createOrder,
      saveOrderAllocations,
      startHarvesting,
      updateFarmProgress,
      correctFarmProgress,
      triggerActiveReminders,
      confirmPickupDone,
      confirmWarehouseReceived,
      addFarm,
      updateFarm,
      toggleFarmActive,
      updateHarvestSettings,
      addUser,
      updateUser,
      toggleUserActive,
      markNotificationRead,
      markAllNotificationsRead,
      getFarmName,
      getFarmUsageCount,
      resetDemoData,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      backendMode,
      authLoading,
      state,
      supabaseUser,
      demoSession,
      userLanguages,
      activeTab,
      adminDepartment,
      toasts,
      reminderPopupNotifications,
    ],
  );

  return <HarvestFlowContext.Provider value={value}>{children}</HarvestFlowContext.Provider>;
}

export function useHarvestFlow(): HarvestFlowContextValue {
  const ctx = useContext(HarvestFlowContext);
  if (!ctx) {
    throw new Error('useHarvestFlow must be used inside HarvestFlowProvider');
  }
  return ctx;
}
