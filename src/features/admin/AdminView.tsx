import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  ClipboardList,
  History,
  KeyRound,
  Lock,
  PackageCheck,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Sprout,
  Truck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DepartmentKey } from '../../auth/permissions';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import type { DemoUser, Farm, Language, Order, UserRole } from '../../types/domain';
import { formatKg } from '../../utils/format';
import { OrderStatusBadge, PriorityBadge } from '../../components/ui/Badges';
import { ModalDialog } from '../../components/ui/ModalDialog';
import { OrderHistoryModal } from '../../components/shared/OrderHistoryModal';
import { CommercialView } from '../commercial/CommercialView';
import { FarmCoordinatorView } from '../harvest/FarmCoordinatorView';
import { TransportView } from '../transport/TransportView';
import { WarehouseView } from '../warehouse/WarehouseView';

type AdminMode = 'dashboard' | 'departments' | 'management';
type ManagementSubTab = 'farms' | 'settings' | 'users';

const ALL_USER_ROLES: UserRole[] = [
  'commercial',
  'farm_coordinator',
  'transport',
  'warehouse',
  'viewer',
  'admin',
];

const DEPARTMENTS: Array<{
  key: DepartmentKey;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'commercial', icon: ClipboardList },
  { key: 'farm_coordinator', icon: Sprout },
  { key: 'transport', icon: Truck },
  { key: 'warehouse', icon: PackageCheck },
];

export function AdminView({ mode }: { mode: AdminMode }) {
  const { t } = useTranslation();
  const {
    state,
    currentUser,
    language,
    adminDepartment,
    setAdminDepartment,
    setActiveTab,
    addFarm,
    updateFarm,
    toggleFarmActive,
    updateHarvestSettings,
    addUser,
    updateUser,
    toggleUserActive,
    getFarmUsageCount,
    getUserSavedLanguage,
  } = useHarvestFlow();

  const [mgmtTab, setMgmtTab] = useState<ManagementSubTab>('farms');
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null);

  // User Create / Edit Modal state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<DemoUser | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('commercial');
  const [userLang, setUserLang] = useState<Language>('fr');
  const [userPassword, setUserPassword] = useState('');
  const [userFormError, setUserFormError] = useState<string | null>(null);

  // Add Farm state
  const [newFarmName, setNewFarmName] = useState('');
  const [newFarmCode, setNewFarmCode] = useState('');
  const [farmError, setFarmError] = useState<string | null>(null);

  // Inline Edit Farm state
  const [editingFarmId, setEditingFarmId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Harvest Settings draft state
  const [stepsDraft, setStepsDraft] = useState<number[]>(state.settings.progressSteps);
  const [newStepInput, setNewStepInput] = useState('');
  const [stepError, setStepError] = useState<string | null>(null);
  const [productsDraft, setProductsDraft] = useState<string[]>(state.settings.productSuggestions);
  const [newProductInput, setNewProductInput] = useState('');
  const [productError, setProductError] = useState<string | null>(null);
  const [reminderInterval, setReminderInterval] = useState(
    String(state.settings.reminderIntervalMinutes),
  );
  const [prepThreshold, setPrepThreshold] = useState(
    String(state.settings.transportPrepThresholdPct),
  );

  const openCreateUserModal = () => {
    setEditingUser(null);
    setUserName('');
    setUserEmail('');
    setUserRole('commercial');
    setUserLang('fr');
    setUserPassword('');
    setUserFormError(null);
    setUserModalOpen(true);
  };

  const openEditUserModal = (user: DemoUser) => {
    setEditingUser(user);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserRole(user.role);
    setUserLang(getUserSavedLanguage(user));
    setUserPassword('');
    setUserFormError(null);
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);

    if (editingUser) {
      const res = await updateUser(editingUser.id, {
        name: userName,
        email: userEmail,
        role: userRole,
        defaultLanguage: userLang,
        newPassword: userPassword.trim() || undefined,
      });
      if (!res.ok) {
        setUserFormError(res.errorMessage ?? (res.errorKey ? t(res.errorKey) : null));
        return;
      }
      setUserModalOpen(false);
      return;
    }

    const res = await addUser({
      name: userName,
      email: userEmail,
      role: userRole,
      defaultLanguage: userLang,
      password: userPassword,
    });
    if (!res.ok) {
      setUserFormError(res.errorMessage ?? (res.errorKey ? t(res.errorKey) : null));
      return;
    }
    setUserModalOpen(false);
  };

  const openSettingsSubTab = () => {
    setStepsDraft(state.settings.progressSteps);
    setProductsDraft(state.settings.productSuggestions);
    setReminderInterval(String(state.settings.reminderIntervalMinutes));
    setPrepThreshold(String(state.settings.transportPrepThresholdPct));
    setStepError(null);
    setProductError(null);
    setNewProductInput('');
    setMgmtTab('settings');
  };

  const handleAddFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFarmError(null);
    const res = await addFarm(newFarmName, newFarmCode);
    if (!res.ok) {
      setFarmError(res.errorMessage ?? (res.errorKey ? t(res.errorKey) : null));
      return;
    }
    setNewFarmName('');
    setNewFarmCode('');
  };

  const startEditFarm = (farm: Farm) => {
    setEditingFarmId(farm.id);
    setEditName(farm.name);
    setEditCode(farm.code ?? '');
    setEditError(null);
  };

  const saveEditFarm = async (farmId: string) => {
    const res = await updateFarm(farmId, editName, editCode);
    if (!res.ok) {
      setEditError(res.errorMessage ?? (res.errorKey ? t(res.errorKey) : null));
      return;
    }
    setEditingFarmId(null);
    setEditError(null);
  };

  const handleAddStep = () => {
    setStepError(null);
    const val = Number(newStepInput);
    if (!Number.isInteger(val) || val < 1 || val > 99 || stepsDraft.includes(val)) {
      setStepError(t('admin.stepInvalidError'));
      return;
    }
    setStepsDraft((prev) => [...prev, val].sort((a, b) => a - b));
    setNewStepInput('');
  };

  const handleRemoveStep = (val: number) => {
    if (val === 100) return;
    setStepsDraft((prev) => prev.filter((n) => n !== val));
  };

  const handleAddProduct = () => {
    setProductError(null);
    const trimmed = newProductInput.trim();
    if (!trimmed) {
      setProductError(t('admin.productEmptyError'));
      return;
    }
    if (productsDraft.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      setProductError(t('admin.productDuplicateError'));
      return;
    }
    setProductsDraft((prev) => [...prev, trimmed.slice(0, 80)]);
    setNewProductInput('');
  };

  const handleRemoveProduct = (name: string) => {
    setProductsDraft((prev) => prev.filter((p) => p !== name));
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateHarvestSettings({
      progressSteps: stepsDraft,
      reminderIntervalMinutes: Number(reminderInterval) || 60,
      transportPrepThresholdPct: Number(prepThreshold) || 70,
      productSuggestions: productsDraft,
    });
  };

  // MODE 1: Admin Full System Overview Dashboard
  if (mode === 'dashboard') {
    const activeOrdersCount = state.orders.filter((o) => o.status !== 'completed').length;
    const urgentCount = state.orders.filter(
      (o) => o.priority === 'urgent' && o.status !== 'completed',
    ).length;
    const activeFarmsCount = state.farms.filter((f) => f.isActive).length;
    const completedCount = state.orders.filter((o) => o.status === 'completed').length;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">{t('admin.title')}</h1>
          <p className="mt-1 text-sm text-[#5a6b60]">{t('admin.subtitle')}</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-emerald-900/10 bg-white p-4">
            <div className="text-xs font-medium text-[#5a6b60]">
              {t('admin.stats.activeOrders')}
            </div>
            <div className="mt-1 text-2xl font-bold text-[#1a241e]">{activeOrdersCount}</div>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
            <div className="text-xs font-medium text-red-700">{t('admin.stats.urgentOrders')}</div>
            <div className="mt-1 text-2xl font-bold text-red-700">{urgentCount}</div>
          </div>
          <div className="rounded-2xl border border-emerald-900/10 bg-white p-4">
            <div className="text-xs font-medium text-[#5a6b60]">
              {t('admin.stats.activeFarms')}
            </div>
            <div className="mt-1 text-2xl font-bold text-[#1b5e20]">{activeFarmsCount}</div>
          </div>
          <div className="rounded-2xl border border-emerald-900/10 bg-white p-4">
            <div className="text-xs font-medium text-[#5a6b60]">
              {t('admin.stats.completedOrders')}
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-800">{completedCount}</div>
          </div>
        </div>

        {/* Quick access to all 4 departments (Admin exclusive) */}
        <section className="rounded-2xl border border-emerald-900/10 bg-white p-5">
          <div>
            <h2 className="text-base font-semibold text-[#1a241e]">{t('nav.departments')}</h2>
            <p className="mt-0.5 text-xs text-[#5a6b60]">{t('dashboard.adminFullAccessNote')}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {DEPARTMENTS.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setAdminDepartment(key);
                  setActiveTab('departments');
                }}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-emerald-900/10 bg-[#fafcfa] p-4 text-left transition hover:border-[#1b5e20]/50 hover:bg-emerald-50/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100/80 text-[#1b5e20]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#1a241e]">{t(`roles.${key}`)}</div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-[#5a6b60]">
                      {t(`roleDescriptions.${key}`)}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-[#5a6b60] transition group-hover:translate-x-0.5 group-hover:text-[#1b5e20]" />
              </button>
            ))}
          </div>
        </section>

        {/* All Orders Overview */}
        <section className="rounded-2xl border border-emerald-900/10 bg-white p-5">
          <h2 className="text-base font-semibold text-[#1a241e]">{t('nav.orders')}</h2>
          <div className="mt-3 divide-y divide-emerald-900/8">
            {state.orders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#1b5e20]">{order.reference}</span>
                    <PriorityBadge priority={order.priority} />
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 text-sm text-[#1a241e]">
                    {order.product} · {formatKg(order.quantityKg, language)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOrder(order)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-900/12 px-3 text-xs font-semibold text-[#435349] hover:bg-emerald-50"
                >
                  <History className="h-4 w-4" />
                  {t('common.viewHistory')}
                </button>
              </div>
            ))}
          </div>
        </section>

        <OrderHistoryModal order={historyOrder} onClose={() => setHistoryOrder(null)} />
      </div>
    );
  }

  // MODE 2: Admin Departmental Switcher
  if (mode === 'departments') {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-emerald-800/20 bg-emerald-50/70 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#1b5e20]">
            <ShieldCheck className="h-4 w-4" />
            <span>
              {t('dashboard.adminDeptBanner', { dept: t(`roles.${adminDepartment}`) })}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {DEPARTMENTS.map(({ key, icon: Icon }) => {
              const active = adminDepartment === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAdminDepartment(key)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-[#1b5e20] text-white shadow-2xs'
                      : 'bg-white text-[#435349] ring-1 ring-emerald-900/10 hover:bg-emerald-100/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t(`rolesShort.${key}`)}
                </button>
              );
            })}
          </div>
        </div>

        {adminDepartment === 'commercial' && <CommercialView />}
        {adminDepartment === 'farm_coordinator' && <FarmCoordinatorView />}
        {adminDepartment === 'transport' && <TransportView />}
        {adminDepartment === 'warehouse' && <WarehouseView />}
      </div>
    );
  }

  // MODE 3: Admin Management (Farms, Settings, Users)
  const activeFarmsCount = state.farms.filter((f) => f.isActive).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">{t('nav.management')}</h1>
        <p className="mt-1 text-sm text-[#5a6b60]">{t('admin.subtitle')}</p>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-emerald-900/10 bg-white p-1.5">
        <button
          type="button"
          onClick={() => setMgmtTab('farms')}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
            mgmtTab === 'farms'
              ? 'bg-[#1b5e20] text-white shadow-2xs'
              : 'text-[#435349] hover:bg-emerald-50/70'
          }`}
        >
          <Sprout className="h-4 w-4" />
          {t('nav.farms')} ({activeFarmsCount}/{state.farms.length})
        </button>
        <button
          type="button"
          onClick={openSettingsSubTab}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
            mgmtTab === 'settings'
              ? 'bg-[#1b5e20] text-white shadow-2xs'
              : 'text-[#435349] hover:bg-emerald-50/70'
          }`}
        >
          <Settings className="h-4 w-4" />
          {t('nav.settings')}
        </button>
        <button
          type="button"
          onClick={() => setMgmtTab('users')}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
            mgmtTab === 'users'
              ? 'bg-[#1b5e20] text-white shadow-2xs'
              : 'text-[#435349] hover:bg-emerald-50/70'
          }`}
        >
          <Users className="h-4 w-4" />
          {t('nav.users')} ({state.users.length})
        </button>
      </div>

      {/* Farms Management */}
      {mgmtTab === 'farms' && (
        <div className="space-y-5">
          <form
            onSubmit={handleAddFarm}
            className="rounded-2xl border border-emerald-900/10 bg-white p-5"
          >
            <h2 className="text-base font-semibold text-[#1a241e]">{t('admin.addFarmTitle')}</h2>
            <p className="mt-1 text-xs text-[#5a6b60]">{t('admin.farmsSubtitle')}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
              <input
                type="text"
                required
                value={newFarmName}
                onChange={(e) => setNewFarmName(e.target.value)}
                placeholder={t('admin.farmNamePlaceholder')}
                aria-label={t('admin.farmNameLabel')}
                className="hf-input min-h-12 rounded-xl border border-emerald-900/15 px-4 text-sm text-[#1a241e] outline-none focus:border-[#1b5e20]"
              />
              <input
                type="text"
                value={newFarmCode}
                onChange={(e) => setNewFarmCode(e.target.value)}
                placeholder={t('admin.farmCodePlaceholder')}
                aria-label={t('admin.farmCodeLabel')}
                className="min-h-12 rounded-xl border border-emerald-900/15 px-4 text-sm text-[#1a241e] outline-none focus:border-[#1b5e20]"
              />
              <button
                type="submit"
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[#1b5e20] px-5 text-sm font-semibold text-white hover:bg-[#144718]"
              >
                <Plus className="h-4 w-4" />
                {t('common.add')}
              </button>
            </div>
            {farmError && <p className="mt-2.5 text-sm font-medium text-red-600">{farmError}</p>}
          </form>

          <section className="rounded-2xl border border-emerald-900/10 bg-white p-5">
            <h2 className="text-base font-semibold text-[#1a241e]">{t('admin.farmsTitle')}</h2>
            <ul className="mt-4 divide-y divide-emerald-900/8">
              {state.farms.map((farm) => {
                const usageCount = getFarmUsageCount(farm.id);
                const isEditing = editingFarmId === farm.id;

                return (
                  <li key={farm.id} className="py-3.5">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="min-h-11 flex-1 rounded-xl border border-emerald-900/20 px-3 text-sm"
                          />
                          <input
                            type="text"
                            value={editCode}
                            onChange={(e) => setEditCode(e.target.value)}
                            placeholder={t('admin.farmCodePlaceholder')}
                            className="min-h-11 rounded-xl border border-emerald-900/20 px-3 text-sm sm:w-36"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEditFarm(farm.id)}
                              className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-[#1b5e20] px-4 text-xs font-semibold text-white"
                            >
                              <Check className="h-4 w-4" />
                              {t('common.save')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingFarmId(null)}
                              className="inline-flex min-h-11 items-center rounded-xl border border-emerald-900/15 px-3 text-xs font-semibold text-[#435349]"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                        {editError && <p className="text-xs font-medium text-red-600">{editError}</p>}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#1a241e]">{farm.name}</span>
                            {farm.code && (
                              <span className="rounded-md bg-[#f6f9f6] px-2 py-0.5 text-xs font-medium text-[#5a6b60]">
                                {farm.code}
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                farm.isActive
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {farm.isActive ? t('common.active') : t('common.inactive')}
                            </span>
                          </div>
                          {usageCount > 0 && (
                            <p className="mt-1 text-xs text-[#5a6b60]">
                              {t('admin.farmReferencedBadge', { count: usageCount })}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditFarm(farm)}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-900/12 px-3.5 text-xs font-semibold text-[#435349] hover:bg-emerald-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            {t('common.edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFarmActive(farm.id)}
                            className={`inline-flex min-h-10 items-center rounded-xl px-3.5 text-xs font-semibold transition ${
                              farm.isActive
                                ? 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                : 'bg-[#1b5e20] text-white hover:bg-[#144718]'
                            }`}
                          >
                            {farm.isActive ? t('common.deactivate') : t('common.activate')}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}

      {/* Harvest & Reminder Settings */}
      {mgmtTab === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          className="space-y-6 rounded-2xl border border-emerald-900/10 bg-white p-5 sm:p-7"
        >
          <div>
            <h2 className="text-lg font-semibold text-[#1a241e]">{t('admin.settingsTitle')}</h2>
            <p className="mt-1 text-sm text-[#5a6b60]">{t('admin.settingsSubtitle')}</p>
          </div>

          <div className="space-y-3 border-t border-emerald-900/8 pt-5">
            <div>
              <label className="block text-sm font-semibold text-[#1a241e]">
                {t('admin.progressStepsLabel')}
              </label>
              <p className="mt-0.5 text-xs text-[#5a6b60]">{t('admin.progressStepsHint')}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {stepsDraft.map((step) => {
                const isProtected = step === 100;
                return (
                  <span
                    key={step}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold ${
                      isProtected
                        ? 'bg-[#1b5e20] text-white'
                        : 'border border-emerald-900/15 bg-[#f6f9f6] text-[#1a241e]'
                    }`}
                  >
                    <span>{step}%</span>
                    {isProtected ? (
                      <span
                        title={t('admin.stepProtectedHint')}
                        className="inline-flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-medium"
                      >
                        <Lock className="h-3 w-3" />
                        {t('common.protected')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(step)}
                        aria-label={`${t('common.cancel')} ${step}%`}
                        className="rounded-md p-0.5 text-[#5a6b60] hover:bg-red-100 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 sm:max-w-sm sm:flex-row">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={newStepInput}
                onChange={(e) => setNewStepInput(e.target.value)}
                placeholder={t('admin.addStepPlaceholder')}
                className="min-h-11 flex-1 rounded-xl border border-emerald-900/15 px-3.5 text-sm outline-none focus:border-[#1b5e20]"
              />
              <button
                type="button"
                onClick={handleAddStep}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#1b5e20] px-4 text-sm font-semibold text-[#1b5e20] hover:bg-emerald-50"
              >
                <Plus className="h-4 w-4" />
                {t('admin.addStepButton')}
              </button>
            </div>
            {stepError && <p className="text-xs font-medium text-red-600">{stepError}</p>}
          </div>

          {/* Agricultural Product Quick-Suggestions */}
          <div className="space-y-3 border-t border-emerald-900/8 pt-5">
            <div>
              <label className="block text-sm font-semibold text-[#1a241e]">
                {t('admin.productsTitle')}
              </label>
              <p className="mt-0.5 text-xs text-[#5a6b60]">{t('admin.productsHint')}</p>
            </div>

            {productsDraft.length === 0 ? (
              <p className="text-xs italic text-[#5a6b60]">{t('admin.productsEmpty')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {productsDraft.map((prod) => (
                  <span
                    key={prod}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-900/15 bg-[#f6f9f6] px-3 py-2 text-sm font-semibold text-[#1a241e]"
                  >
                    {prod}
                    <button
                      type="button"
                      onClick={() => handleRemoveProduct(prod)}
                      aria-label={`${t('common.close')} ${prod}`}
                      className="rounded-md p-0.5 text-[#5a6b60] hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:max-w-md sm:flex-row">
              <input
                type="text"
                maxLength={80}
                value={newProductInput}
                onChange={(e) => setNewProductInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddProduct();
                  }
                }}
                placeholder={t('admin.addProductPlaceholder')}
                className="min-h-11 flex-1 rounded-xl border border-emerald-900/15 px-3.5 text-sm outline-none focus:border-[#1b5e20]"
              />
              <button
                type="button"
                onClick={handleAddProduct}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#1b5e20] px-4 text-sm font-semibold text-[#1b5e20] hover:bg-emerald-50"
              >
                <Plus className="h-4 w-4" />
                {t('admin.addProductButton')}
              </button>
            </div>
            {productError && <p className="text-xs font-medium text-red-600">{productError}</p>}
          </div>

          <div className="space-y-2 border-t border-emerald-900/8 pt-5">
            <label
              htmlFor="reminder-interval"
              className="block text-sm font-semibold text-[#1a241e]"
            >
              {t('admin.reminderIntervalLabel')}
            </label>
            <p className="text-xs text-[#5a6b60]">{t('admin.reminderIntervalHint')}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                id="reminder-interval"
                type="number"
                inputMode="numeric"
                min={5}
                max={1440}
                required
                value={reminderInterval}
                onChange={(e) => setReminderInterval(e.target.value)}
                className="min-h-11 w-28 rounded-xl border border-emerald-900/15 px-3.5 text-sm font-semibold outline-none focus:border-[#1b5e20]"
              />
              <div className="flex flex-wrap gap-1.5">
                {[15, 30, 60, 120].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setReminderInterval(String(mins))}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      Number(reminderInterval) === mins
                        ? 'bg-[#1b5e20] text-white'
                        : 'bg-[#f6f9f6] text-[#435349] hover:bg-emerald-50'
                    }`}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t border-emerald-900/8 pt-5">
            <label
              htmlFor="prep-threshold"
              className="block text-sm font-semibold text-[#1a241e]"
            >
              {t('admin.prepThresholdLabel')}
            </label>
            <p className="text-xs text-[#5a6b60]">{t('admin.prepThresholdHint')}</p>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="prep-threshold"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                required
                value={prepThreshold}
                onChange={(e) => setPrepThreshold(e.target.value)}
                className="min-h-11 w-28 rounded-xl border border-emerald-900/15 px-3.5 text-sm font-semibold outline-none focus:border-[#1b5e20]"
              />
              <span className="text-sm font-semibold text-[#5a6b60]">%</span>
            </div>
          </div>

          <div className="flex justify-end border-t border-emerald-900/8 pt-4">
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#1b5e20] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#144718]"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      )}

      {/* Employees & Roles Management */}
      {mgmtTab === 'users' && (
        <section className="rounded-2xl border border-emerald-900/10 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#1a241e]">{t('admin.usersTitle')}</h2>
              <p className="mt-1 text-xs text-[#5a6b60]">{t('admin.usersSubtitle')}</p>
            </div>
            <button
              type="button"
              onClick={openCreateUserModal}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1b5e20] px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-[#144718]"
            >
              <UserPlus className="h-4 w-4" />
              {t('admin.addUserTitle')}
            </button>
          </div>

          <ul className="mt-5 divide-y divide-emerald-900/8">
            {state.users.map((user) => {
              const isSelf = user.id === currentUser.id;
              return (
                <li
                  key={user.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        user.isActive
                          ? 'bg-emerald-100 text-[#1b5e20]'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {user.initials}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#1a241e]">{user.name}</span>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-[#1b5e20]">
                          {t(`roles.${user.role}`)}
                        </span>
                        <span className="rounded-md bg-[#f6f9f6] px-2 py-0.5 text-[11px] font-bold uppercase text-[#435349]">
                          {getUserSavedLanguage(user)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            user.isActive
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {user.isActive ? t('common.active') : t('common.inactive')}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5a6b60]">
                        <span>{user.email}</span>
                        {user.passwordUpdatedAt && (
                          <span className="inline-flex items-center gap-1 text-emerald-800">
                            <KeyRound className="h-3 w-3" />
                            {t('admin.passwordSetBadge')}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[#5a6b60]">
                        {t(`roleDescriptions.${user.role}`)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditUserModal(user)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-900/12 px-3.5 text-xs font-semibold text-[#435349] transition hover:bg-emerald-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t('common.edit')}
                    </button>
                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => toggleUserActive(user.id)}
                        className={`inline-flex min-h-10 items-center rounded-xl px-3.5 text-xs font-semibold transition ${
                          user.isActive
                            ? 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                            : 'bg-[#1b5e20] text-white hover:bg-[#144718]'
                        }`}
                      >
                        {user.isActive ? t('common.deactivate') : t('common.activate')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Create / Edit User Modal */}
      <ModalDialog
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? t('admin.editUserTitle') : t('admin.addUserTitle')}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div>
            <label htmlFor="admin-user-name" className="block text-sm font-medium text-[#1a241e]">
              {t('admin.userNameLabel')} <span className="text-red-600">*</span>
            </label>
            <input
              id="admin-user-name"
              type="text"
              required
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder={t('admin.userNamePlaceholder')}
              className="hf-input mt-1.5 min-h-11 w-full rounded-xl border border-emerald-900/15 px-3.5 text-sm outline-none focus:border-[#1b5e20]"
            />
          </div>

          <div>
            <label htmlFor="admin-user-email" className="block text-sm font-medium text-[#1a241e]">
              {t('admin.userEmailLabel')} <span className="text-red-600">*</span>
            </label>
            <input
              id="admin-user-email"
              type="email"
              required
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder={t('admin.userEmailPlaceholder')}
              className="hf-input mt-1.5 min-h-11 w-full rounded-xl border border-emerald-900/15 px-3.5 text-sm outline-none focus:border-[#1b5e20]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="admin-user-role" className="block text-sm font-medium text-[#1a241e]">
                {t('admin.userDepartmentLabel')}
              </label>
              <select
                id="admin-user-role"
                value={userRole}
                onChange={(e) => {
                  const nextRole = e.target.value as UserRole;
                  setUserRole(nextRole);
                  if (!editingUser && nextRole === 'farm_coordinator') {
                    setUserLang('es');
                  }
                }}
                disabled={editingUser?.id === currentUser.id}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-emerald-900/15 bg-white px-3 text-sm font-medium text-[#1a241e] outline-none focus:border-[#1b5e20] disabled:bg-gray-50 disabled:text-gray-500"
              >
                {ALL_USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="admin-user-lang" className="block text-sm font-medium text-[#1a241e]">
                {t('auth.preferredLanguage')}
              </label>
              <select
                id="admin-user-lang"
                value={userLang}
                onChange={(e) => setUserLang(e.target.value as Language)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-emerald-900/15 bg-white px-3 text-sm font-medium text-[#1a241e] outline-none focus:border-[#1b5e20]"
              >
                <option value="fr">Français (FR)</option>
                <option value="es">Español (ES)</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="admin-user-password"
              className="block text-sm font-medium text-[#1a241e]"
            >
              {editingUser ? t('admin.userNewPasswordLabel') : t('admin.userPasswordLabel')}{' '}
              {!editingUser && <span className="text-red-600">*</span>}
            </label>
            <input
              id="admin-user-password"
              type="password"
              required={!editingUser}
              minLength={editingUser ? undefined : 6}
              autoComplete="new-password"
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              placeholder={t('admin.userPasswordPlaceholder')}
              className="hf-input mt-1.5 min-h-11 w-full rounded-xl border border-emerald-900/15 px-3.5 text-sm outline-none focus:border-[#1b5e20]"
            />
            <p className="mt-1 text-xs text-[#5a6b60]">
              {editingUser ? t('admin.userNewPasswordHint') : t('admin.userPasswordDemoNote')}
            </p>
          </div>

          {userFormError && (
            <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
              {userFormError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setUserModalOpen(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-900/15 bg-white px-5 text-sm font-medium text-[#1a241e] hover:bg-emerald-50/50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1b5e20] px-6 text-sm font-semibold text-white hover:bg-[#144718]"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
