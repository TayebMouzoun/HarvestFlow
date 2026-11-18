import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  History,
  PackageCheck,
  Search,
  Sprout,
  Truck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import type { Order } from '../../types/domain';
import { formatDateTime, formatKg } from '../../utils/format';
import { OrderStatusBadge, PriorityBadge, ProgressBar } from '../../components/ui/Badges';
import { OrderHistoryModal } from '../../components/shared/OrderHistoryModal';

interface ViewerViewProps {
  mode: 'dashboard' | 'workspace';
}

export function ViewerView({ mode }: ViewerViewProps) {
  const { t } = useTranslation();
  const { state, currentUser, language, setActiveTab, getFarmName } = useHarvestFlow();

  const [filter, setFilter] = useState<'all' | 'urgent' | 'active' | 'completed'>('all');
  const [search, setSearch] = useState('');
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null);

  const activeOrders = state.orders.filter((o) => o.status !== 'completed');
  const urgentOrders = activeOrders.filter((o) => o.priority === 'urgent');
  const completedOrders = state.orders.filter((o) => o.status === 'completed');
  const activeFarmsHarvesting = state.orders
    .filter((o) => o.status === 'in_progress')
    .flatMap((o) => o.allocations)
    .filter((a) => a.harvestStatus === 'in_progress').length;
  const inTransitCount = state.orders
    .flatMap((o) => o.allocations)
    .filter((a) => a.pickupDone && !a.receivedDone).length;

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...state.orders]
      .filter((o) => {
        if (filter === 'urgent') return o.priority === 'urgent' && o.status !== 'completed';
        if (filter === 'active') return o.status !== 'completed';
        if (filter === 'completed') return o.status === 'completed';
        return true;
      })
      .filter((o) =>
        q
          ? o.reference.toLowerCase().includes(q) ||
            o.product.toLowerCase().includes(q) ||
            o.allocations.some((a) =>
              getFarmName(a.farmId, a.farmNameSnapshot).toLowerCase().includes(q),
            )
          : true,
      )
      .sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
        if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [state.orders, filter, search, getFarmName]);

  const renderOrderCard = (order: Order) => (
    <article
      key={order.id}
      className={`rounded-2xl border bg-white p-5 shadow-2xs ${
        order.priority === 'urgent' && order.status !== 'completed'
          ? 'border-red-200 ring-1 ring-red-500/10'
          : 'border-emerald-900/10'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-[#1b5e20]">{order.reference}</span>
            <PriorityBadge priority={order.priority} />
            <OrderStatusBadge status={order.status} />
          </div>
          <h3 className="mt-2 text-lg font-semibold text-[#1a241e]">
            {order.product}{' '}
            <span className="font-normal text-[#5a6b60]">
              — {formatKg(order.quantityKg, language)}
            </span>
          </h3>
          {order.notes && <p className="mt-1 text-sm text-[#5a6b60]">{order.notes}</p>}
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

      {/* End-to-end farm pipeline visibility (strictly read-only) */}
      <div className="mt-4 border-t border-emerald-900/8 pt-3.5">
        {order.allocations.length === 0 ? (
          <p className="flex items-center gap-2 text-xs font-medium text-amber-800">
            <Sprout className="h-4 w-4" />
            {t('commercial.awaitingJuan')}
          </p>
        ) : (
          <div className="grid gap-2.5">
            {order.allocations.map((alloc) => {
              const farmName = getFarmName(alloc.farmId, alloc.farmNameSnapshot);
              return (
                <div
                  key={alloc.id}
                  className="rounded-xl border border-emerald-900/8 bg-[#fafcfa] p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[#1a241e]">
                      {farmName}{' '}
                      <span className="font-normal text-[#5a6b60]">
                        · {formatKg(alloc.allocatedQtyKg, language)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-[#1b5e20]">
                        <Sprout className="h-3 w-3" />
                        {alloc.currentProgressPct}%
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${
                          alloc.pickupDone
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        <Truck className="h-3 w-3" />
                        {alloc.pickupDone
                          ? t('status.pickup.done')
                          : alloc.harvestStatus === 'completed'
                            ? t('status.pickup.ready')
                            : t('status.pickup.waiting')}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${
                          alloc.receivedDone
                            ? 'bg-[#1b5e20] text-white'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        <PackageCheck className="h-3 w-3" />
                        {alloc.receivedDone
                          ? t('status.warehouse.received')
                          : alloc.pickupDone
                            ? t('status.warehouse.in_transit')
                            : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2">
                    <ProgressBar
                      value={alloc.currentProgressPct}
                      highlight={
                        alloc.currentProgressPct >= state.settings.transportPrepThresholdPct &&
                        alloc.currentProgressPct < 100
                          ? 'amber'
                          : 'green'
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#5a6b60]">
        <span>{formatDateTime(order.createdAt, language)}</span>
        {order.completedAt && (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('status.order.completed')} · {formatDateTime(order.completedAt, language)}
          </span>
        )}
      </div>
    </article>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-[#1b5e20] ring-1 ring-emerald-700/15">
            <Eye className="h-3.5 w-3.5" />
            {t('admin.viewerReadOnlyBadge')}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1a241e]">
            {mode === 'dashboard'
              ? t('dashboard.welcome', { name: currentUser.name })
              : t('admin.viewerReadOnlyTitle')}
          </h1>
          <p className="mt-1 text-sm text-[#5a6b60]">{t('admin.viewerReadOnlySubtitle')}</p>
        </div>

        {mode === 'dashboard' && (
          <button
            type="button"
            onClick={() => setActiveTab('workspace')}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-900/15 bg-white px-4 text-sm font-semibold text-[#1b5e20] hover:bg-emerald-50"
          >
            {t('nav.processTracking')}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {mode === 'dashboard' ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-emerald-900/10 bg-white p-4">
              <div className="text-xs font-medium text-[#5a6b60]">
                {t('admin.stats.activeOrders')}
              </div>
              <div className="mt-1 text-2xl font-bold text-[#1a241e]">{activeOrders.length}</div>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
              <div className="text-xs font-medium text-red-700">
                {t('dashboard.kpis.urgentOrders')}
              </div>
              <div className="mt-1 text-2xl font-bold text-red-700">{urgentOrders.length}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="text-xs font-medium text-[#1b5e20]">
                {t('dashboard.kpis.activeFarmsHarvesting')}
              </div>
              <div className="mt-1 text-2xl font-bold text-[#1b5e20]">{activeFarmsHarvesting}</div>
            </div>
            <div className="rounded-2xl border border-emerald-900/10 bg-white p-4">
              <div className="text-xs font-medium text-[#5a6b60]">
                {t('dashboard.kpis.expectedArrivals')} / {t('dashboard.kpis.completed')}
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-800">
                {inTransitCount} / {completedOrders.length}
              </div>
            </div>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1a241e]">{t('nav.orders')}</h2>
              <button
                type="button"
                onClick={() => setActiveTab('workspace')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1b5e20] hover:underline"
              >
                {t('dashboard.openWorkspace')}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid gap-4">{activeOrders.slice(0, 3).map(renderOrderCard)}</div>
          </section>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6b60]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common.searchPlaceholder')}
                className="w-full rounded-xl border border-emerald-900/12 bg-white py-2.5 pl-10 pr-4 text-sm text-[#1a241e] outline-none focus:border-[#1b5e20]"
              />
            </div>

            <div className="inline-flex flex-wrap rounded-xl border border-emerald-900/12 bg-white p-1">
              {(
                [
                  { id: 'all', label: t('common.filterAll') },
                  { id: 'urgent', label: t('common.filterUrgent') },
                  { id: 'active', label: t('admin.viewerFilterActive') },
                  { id: 'completed', label: t('admin.viewerFilterCompleted') },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    filter === item.id
                      ? 'bg-[#1b5e20] text-white'
                      : 'text-[#5a6b60] hover:text-[#1a241e]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-emerald-900/8 bg-white p-10 text-center text-sm text-[#5a6b60]">
              {t('common.noData')}
            </div>
          ) : (
            <div className="grid gap-4">{filteredOrders.map(renderOrderCard)}</div>
          )}
        </div>
      )}

      <OrderHistoryModal order={historyOrder} onClose={() => setHistoryOrder(null)} />
    </div>
  );
}
