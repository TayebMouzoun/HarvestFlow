import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Eye,
  History,
  PackageCheck,
  Plus,
  Sprout,
  Truck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import type { Order } from '../../types/domain';
import { formatDateTime, formatKg } from '../../utils/format';
import { OrderStatusBadge, PriorityBadge, ProgressBar } from '../../components/ui/Badges';
import { OrderHistoryModal } from '../../components/shared/OrderHistoryModal';

interface KpiCardProps {
  label: string;
  value: number;
  tone?: 'default' | 'green' | 'amber' | 'red';
}

function KpiCard({ label, value, tone = 'default' }: KpiCardProps) {
  const styles =
    tone === 'red'
      ? 'border-red-200 bg-red-50/40 text-red-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/50 text-amber-900'
        : tone === 'green'
          ? 'border-emerald-200 bg-emerald-50/50 text-[#1b5e20]'
          : 'border-emerald-900/10 bg-white text-[#1a241e]';

  return (
    <div className={`rounded-2xl border p-4 shadow-2xs ${styles}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function computeOrderProgressPct(order: Order): number {
  if (order.status === 'completed') return 100;
  if (order.allocations.length === 0) return 0;
  const totalKg = order.allocations.reduce((sum, a) => sum + a.allocatedQtyKg, 0);
  if (totalKg <= 0) {
    return Math.round(
      order.allocations.reduce((sum, a) => sum + a.currentProgressPct, 0) /
        order.allocations.length,
    );
  }
  const weighted = order.allocations.reduce(
    (sum, a) => sum + a.currentProgressPct * a.allocatedQtyKg,
    0,
  );
  return Math.round(weighted / totalKg);
}

interface TeamOrdersOverviewProps {
  orders: Order[];
  transportPrepThresholdPct: number;
  onInspectHistory: (order: Order) => void;
  onOpenWorkspace?: () => void;
}

function TeamOrdersOverview({
  orders,
  transportPrepThresholdPct,
  onInspectHistory,
  onOpenWorkspace,
}: TeamOrdersOverviewProps) {
  const { t } = useTranslation();
  const { language, getFarmName } = useHarvestFlow();
  const [filter, setFilter] = useState<'active' | 'completed'>('active');

  const { activeOrders, completedOrders } = useMemo(() => {
    const sortByUrgentThenNewest = (a: Order, b: Order) => {
      if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
      if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    };

    return {
      activeOrders: orders
        .filter((o) => o.status !== 'completed')
        .sort(sortByUrgentThenNewest),
      completedOrders: orders
        .filter((o) => o.status === 'completed')
        .sort(
          (a, b) =>
            new Date(b.completedAt ?? b.createdAt).getTime() -
            new Date(a.completedAt ?? a.createdAt).getTime(),
        ),
    };
  }, [orders]);

  const visibleOrders = filter === 'active' ? activeOrders : completedOrders;

  return (
    <section className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-2xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#1a241e]">
              <ClipboardList className="h-4 w-4 text-[#1b5e20]" />
              {t('dashboard.teamOrdersTitle')}
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#1b5e20] ring-1 ring-emerald-700/15">
              <Eye className="h-3 w-3" />
              {t('dashboard.teamOrdersBadge')}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#5a6b60]">{t('dashboard.teamOrdersSubtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-emerald-900/12 bg-[#f6f9f6] p-0.5">
            <button
              type="button"
              onClick={() => setFilter('active')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === 'active'
                  ? 'bg-[#1b5e20] text-white shadow-2xs'
                  : 'text-[#435349] hover:text-[#1b5e20]'
              }`}
            >
              {t('admin.viewerFilterActive')} ({activeOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('completed')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === 'completed'
                  ? 'bg-[#1b5e20] text-white shadow-2xs'
                  : 'text-[#435349] hover:text-[#1b5e20]'
              }`}
            >
              {t('admin.viewerFilterCompleted')} ({completedOrders.length})
            </button>
          </div>

          {onOpenWorkspace && (
            <button
              type="button"
              onClick={onOpenWorkspace}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1b5e20] hover:underline"
            >
              {t('dashboard.openWorkspace')}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {visibleOrders.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#5a6b60]">
            {filter === 'active'
              ? t('dashboard.teamOrdersEmptyActive')
              : t('dashboard.teamOrdersEmptyCompleted')}
          </p>
        ) : (
          visibleOrders.map((order) => {
            const overallPct = computeOrderProgressPct(order);
            return (
              <article
                key={order.id}
                className={`rounded-xl border p-4 ${
                  order.priority === 'urgent' && order.status !== 'completed'
                    ? 'border-red-200 bg-red-50/20'
                    : 'border-emerald-900/10 bg-[#fafcfa]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#1b5e20]">{order.reference}</span>
                      <PriorityBadge priority={order.priority} />
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-[#1a241e]">
                      {order.product}{' '}
                      <span className="font-normal text-[#5a6b60]">
                        · {formatKg(order.quantityKg, language)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-[#5a6b60]">
                      {formatDateTime(order.createdAt, language)}
                      {order.notes ? ` · ${order.notes}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {order.allocations.length > 0 && (
                      <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-[#1b5e20] ring-1 ring-emerald-900/10">
                        {overallPct}%
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onInspectHistory(order)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-emerald-900/12 bg-white px-2.5 text-xs font-semibold text-[#435349] hover:bg-emerald-50"
                    >
                      <History className="h-3.5 w-3.5" />
                      {t('common.viewHistory')}
                    </button>
                  </div>
                </div>

                {order.allocations.length === 0 ? (
                  <p className="mt-2.5 text-xs italic text-[#5a6b60]">
                    {t('dashboard.teamOrdersAwaitingFarms')}
                  </p>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    <ProgressBar
                      value={overallPct}
                      highlight={
                        overallPct >= transportPrepThresholdPct && overallPct < 100
                          ? 'amber'
                          : 'green'
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      {order.allocations.map((alloc) => {
                        const farmName = getFarmName(alloc.farmId, alloc.farmNameSnapshot);
                        return (
                          <span
                            key={alloc.id}
                            className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-emerald-900/10 bg-white px-2.5 py-1 text-xs text-[#1a241e]"
                          >
                            <span className="font-semibold">{farmName}</span>
                            <span className="text-[#5a6b60]">
                              {formatKg(alloc.allocatedQtyKg, language)}
                            </span>
                            <span
                              className={`font-bold ${
                                alloc.currentProgressPct === 100
                                  ? 'text-[#1b5e20]'
                                  : alloc.currentProgressPct >= transportPrepThresholdPct
                                    ? 'text-amber-700'
                                    : 'text-[#435349]'
                              }`}
                            >
                              {alloc.harvestStatus === 'pending'
                                ? t('status.harvest.pending')
                                : `${alloc.currentProgressPct}%`}
                            </span>
                            {alloc.pickupDone && (
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                                {t('status.pickup.done')}
                              </span>
                            )}
                            {alloc.receivedDone && (
                              <span className="rounded-full bg-[#1b5e20] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {t('status.warehouse.received')}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

export function RoleDashboardView() {
  const { t } = useTranslation();
  const {
    state,
    currentRole,
    currentUser,
    language,
    setActiveTab,
    triggerActiveReminders,
    getFarmName,
  } = useHarvestFlow();

  const [historyOrder, setHistoryOrder] = useState<Order | null>(null);

  const unreadCount = state.notifications.filter(
    (n) => n.targetRole === currentRole && !n.isRead,
  ).length;

  const threshold = state.settings.transportPrepThresholdPct;

  // COMMERCIAL DASHBOARD
  if (currentRole === 'commercial') {
    const activeOrders = state.orders.filter((o) => o.status !== 'completed');
    const urgentOrders = activeOrders.filter((o) => o.priority === 'urgent');
    const completedOrders = state.orders.filter((o) => o.status === 'completed');

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">
              {t('dashboard.welcome', { name: currentUser.name })}
            </h1>
            <p className="mt-1 text-sm text-[#5a6b60]">{t('commercial.subtitle')}</p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('workspace')}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1b5e20] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#144718]"
          >
            <Plus className="h-5 w-5" />
            {t('commercial.createButton')}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label={t('dashboard.kpis.totalOrders')} value={state.orders.length} />
          <KpiCard
            label={t('dashboard.kpis.urgentOrders')}
            value={urgentOrders.length}
            tone={urgentOrders.length > 0 ? 'red' : 'default'}
          />
          <KpiCard label={t('dashboard.kpis.inProgress')} value={activeOrders.length} tone="green" />
          <KpiCard label={t('dashboard.kpis.completed')} value={completedOrders.length} />
        </div>

        <TeamOrdersOverview
          orders={state.orders}
          transportPrepThresholdPct={threshold}
          onInspectHistory={setHistoryOrder}
          onOpenWorkspace={() => setActiveTab('workspace')}
        />

        <OrderHistoryModal order={historyOrder} onClose={() => setHistoryOrder(null)} />
      </div>
    );
  }

  // FARM COORDINATOR (JUAN) DASHBOARD
  if (currentRole === 'farm_coordinator') {
    const pendingAllocation = state.orders.filter((o) => o.status === 'pending_allocation');
    const readyToStart = state.orders.filter((o) => o.status === 'allocated');
    const activeHarvestItems = state.orders
      .filter((o) => o.status === 'in_progress')
      .flatMap((order) =>
        order.allocations
          .filter((a) => a.harvestStatus === 'in_progress')
          .map((alloc) => ({
            order,
            alloc,
            farmName: getFarmName(alloc.farmId, alloc.farmNameSnapshot),
          })),
      );

    const attentionOrders = [...pendingAllocation, ...readyToStart];

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">
              {t('dashboard.welcome', { name: currentUser.name })}
            </h1>
            <p className="mt-1 text-sm text-[#5a6b60]">{t('harvest.subtitle')}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => triggerActiveReminders()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              <BellRing className="h-4 w-4" />
              {t('harvest.simulateReminder')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('workspace')}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#1b5e20] px-4 text-sm font-semibold text-white hover:bg-[#144718]"
            >
              <Sprout className="h-4 w-4" />
              {t('nav.harvests')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label={t('dashboard.kpis.pendingAllocation')}
            value={pendingAllocation.length}
            tone={pendingAllocation.length > 0 ? 'amber' : 'default'}
          />
          <KpiCard
            label={t('dashboard.kpis.readyToStart')}
            value={readyToStart.length}
            tone="default"
          />
          <KpiCard
            label={t('dashboard.kpis.activeFarmsHarvesting')}
            value={activeHarvestItems.length}
            tone="green"
          />
          <KpiCard
            label={t('dashboard.kpis.unreadAlerts')}
            value={unreadCount}
            tone={unreadCount > 0 ? 'red' : 'default'}
          />
        </div>

        {/* Orders needing Juan's setup/start */}
        {attentionOrders.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#1a241e]">{t('harvest.pendingTitle')}</h2>
              <button
                type="button"
                onClick={() => setActiveTab('workspace')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1b5e20] hover:underline"
              >
                {t('dashboard.openWorkspace')}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 divide-y divide-emerald-900/8">
              {attentionOrders.map((order) => (
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
                    onClick={() => setActiveTab('workspace')}
                    className="rounded-xl bg-[#1b5e20] px-4 py-2 text-xs font-semibold text-white hover:bg-[#144718]"
                  >
                    {order.status === 'pending_allocation'
                      ? t('harvest.allocateButton')
                      : t('harvest.startHarvestButton')}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active farms currently harvesting */}
        {activeHarvestItems.length > 0 && (
          <section className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#1a241e]">
                <Sprout className="h-4 w-4 text-[#1b5e20]" />
                {t('dashboard.activeHarvestsTitle')} ({activeHarvestItems.length})
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('workspace')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1b5e20] hover:underline"
              >
                {t('dashboard.openWorkspace')}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {activeHarvestItems.map(({ order, alloc, farmName }) => (
                <div
                  key={alloc.id}
                  className="rounded-xl border border-emerald-900/10 bg-[#fafcfa] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#1b5e20]">{order.reference}</span>
                      <PriorityBadge priority={order.priority} />
                    </div>
                    <span className="text-base font-bold text-[#1b5e20]">
                      {alloc.currentProgressPct}%
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#1a241e]">{farmName}</div>
                  <p className="text-xs text-[#5a6b60]">
                    {order.product} · {formatKg(alloc.allocatedQtyKg, language)}
                  </p>
                  <div className="mt-2.5">
                    <ProgressBar
                      value={alloc.currentProgressPct}
                      highlight={
                        alloc.currentProgressPct >= threshold && alloc.currentProgressPct < 100
                          ? 'amber'
                          : 'green'
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <TeamOrdersOverview
          orders={state.orders}
          transportPrepThresholdPct={threshold}
          onInspectHistory={setHistoryOrder}
          onOpenWorkspace={() => setActiveTab('workspace')}
        />

        <OrderHistoryModal order={historyOrder} onClose={() => setHistoryOrder(null)} />
      </div>
    );
  }

  // TRANSPORT DASHBOARD
  if (currentRole === 'transport') {
    const activeAllocs = state.orders
      .filter((o) => o.status === 'in_progress' || o.status === 'completed')
      .flatMap((order) =>
        order.allocations
          .filter((a) => a.harvestStatus !== 'pending')
          .map((alloc) => ({
            order,
            alloc,
            farmName: getFarmName(alloc.farmId, alloc.farmNameSnapshot),
          })),
      );

    const ready = activeAllocs.filter(
      (i) => i.alloc.harvestStatus === 'completed' && !i.alloc.pickupDone,
    );
    const prep = activeAllocs.filter(
      (i) => i.alloc.harvestStatus === 'in_progress' && i.alloc.currentProgressPct >= threshold,
    );
    const activeOrdersCount = state.orders.filter((o) => o.status !== 'completed').length;
    const collected = activeAllocs.filter((i) => i.alloc.pickupDone);

    const priorityCards = [...ready, ...prep];

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">
              {t('dashboard.welcome', { name: currentUser.name })}
            </h1>
            <p className="mt-1 text-sm text-[#5a6b60]">{t('transport.subtitle')}</p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('workspace')}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1b5e20] px-5 text-sm font-semibold text-white hover:bg-[#144718]"
          >
            <Truck className="h-4 w-4" />
            {t('nav.transportQueue')}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label={t('dashboard.kpis.readyForPickup')}
            value={ready.length}
            tone={ready.length > 0 ? 'green' : 'default'}
          />
          <KpiCard
            label={t('dashboard.kpis.prepAlerts')}
            value={prep.length}
            tone={prep.length > 0 ? 'amber' : 'default'}
          />
          <KpiCard label={t('admin.stats.activeOrders')} value={activeOrdersCount} />
          <KpiCard label={t('dashboard.kpis.collectedToday')} value={collected.length} />
        </div>

        {/* Transport Priority Queue (Ready 100% + Prep >= threshold) */}
        <section className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[#1a241e]">
              {t('transport.readySection')} & {t('transport.prepSection', { threshold })}
            </h2>
            <button
              type="button"
              onClick={() => setActiveTab('workspace')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1b5e20] hover:underline"
            >
              {t('dashboard.openWorkspace')}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {priorityCards.length === 0 ? (
              <p className="py-5 text-center text-sm text-[#5a6b60]">
                {t('dashboard.transportNoPriority')}
              </p>
            ) : (
              priorityCards.slice(0, 6).map(({ order, alloc, farmName }) => (
                <div
                  key={alloc.id}
                  className="rounded-xl border border-emerald-900/10 bg-[#fafcfa] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#1b5e20]">{order.reference}</span>
                      <PriorityBadge priority={order.priority} />
                      <span className="text-sm font-semibold text-[#1a241e]">{farmName}</span>
                    </div>
                    <span className="text-sm font-bold text-[#1b5e20]">
                      {alloc.currentProgressPct}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#5a6b60]">
                    {order.product} · {formatKg(alloc.allocatedQtyKg, language)}
                  </p>
                  <div className="mt-2.5">
                    <ProgressBar
                      value={alloc.currentProgressPct}
                      highlight={alloc.currentProgressPct < 100 ? 'amber' : 'green'}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Full Team Orders Overview so Transport sees every order from creation */}
        <TeamOrdersOverview
          orders={state.orders}
          transportPrepThresholdPct={threshold}
          onInspectHistory={setHistoryOrder}
        />

        <OrderHistoryModal order={historyOrder} onClose={() => setHistoryOrder(null)} />
      </div>
    );
  }

  // WAREHOUSE DASHBOARD
  const deliveries = state.orders.flatMap((order) =>
    order.allocations
      .filter((a) => a.pickupDone)
      .map((alloc) => ({
        order,
        alloc,
        farmName: getFarmName(alloc.farmId, alloc.farmNameSnapshot),
      })),
  );
  const incoming = deliveries.filter((d) => !d.alloc.receivedDone);
  const received = deliveries.filter((d) => d.alloc.receivedDone);
  const activeOrdersCount = state.orders.filter((o) => o.status !== 'completed').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">
            {t('dashboard.welcome', { name: currentUser.name })}
          </h1>
          <p className="mt-1 text-sm text-[#5a6b60]">{t('warehouse.subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('workspace')}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1b5e20] px-5 text-sm font-semibold text-white hover:bg-[#144718]"
        >
          <PackageCheck className="h-4 w-4" />
          {t('nav.warehouseQueue')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label={t('dashboard.kpis.expectedArrivals')}
          value={incoming.length}
          tone={incoming.length > 0 ? 'green' : 'default'}
        />
        <KpiCard label={t('admin.stats.activeOrders')} value={activeOrdersCount} />
        <KpiCard label={t('dashboard.kpis.receivedDeliveries')} value={received.length} />
        <KpiCard
          label={t('dashboard.kpis.unreadAlerts')}
          value={unreadCount}
          tone={unreadCount > 0 ? 'amber' : 'default'}
        />
      </div>

      {/* Incoming deliveries already collected by Transport */}
      <section className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[#1a241e]">
            {t('warehouse.incomingSection')}
          </h2>
          <button
            type="button"
            onClick={() => setActiveTab('workspace')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#1b5e20] hover:underline"
          >
            {t('dashboard.openWorkspace')}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-4 divide-y divide-emerald-900/8">
          {incoming.length === 0 ? (
            <p className="py-5 text-center text-sm text-[#5a6b60]">{t('warehouse.emptyIncoming')}</p>
          ) : (
            incoming.map(({ order, alloc, farmName }) => (
              <div
                key={alloc.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#1b5e20]">{order.reference}</span>
                    <PriorityBadge priority={order.priority} />
                    <span className="text-sm font-semibold text-[#1a241e]">{farmName}</span>
                  </div>
                  <p className="mt-1 text-sm text-[#5a6b60]">
                    {order.product} · {formatKg(alloc.allocatedQtyKg, language)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('workspace')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#1b5e20] px-4 py-2 text-xs font-semibold text-white hover:bg-[#144718]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('warehouse.markReceivedButton')}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Full Team Orders Overview so Warehouse sees all created/upcoming orders */}
      <TeamOrdersOverview
        orders={state.orders}
        transportPrepThresholdPct={threshold}
        onInspectHistory={setHistoryOrder}
      />

      <OrderHistoryModal order={historyOrder} onClose={() => setHistoryOrder(null)} />
    </div>
  );
}
