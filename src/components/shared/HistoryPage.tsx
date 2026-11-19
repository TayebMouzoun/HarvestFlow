import { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  Clock,
  Layers,
  Search,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import type { HistoryEvent, Order, UserRole } from '../../types/domain';
import {
  formatDateTime,
  formatKg,
  isWithinDateRange,
  type DateRangeFilter,
} from '../../utils/format';
import { OrderStatusBadge, PriorityBadge } from '../ui/Badges';

const ROLE_VISIBLE_ACTIONS: Record<Exclude<UserRole, 'admin'>, Set<string>> = {
  commercial: new Set([
    'history.actions.order_created',
    'history.actions.farms_allocated',
    'history.actions.harvest_started',
    'history.actions.harvest_completed',
    'history.actions.pickup_confirmed',
    'history.actions.warehouse_received',
    'history.actions.order_completed',
  ]),
  farm_coordinator: new Set([
    'history.actions.order_created',
    'history.actions.farms_allocated',
    'history.actions.harvest_started',
    'history.actions.progress_updated',
    'history.actions.progress_corrected',
    'history.actions.progress_corrected_with_reason',
    'history.actions.harvest_completed',
    'history.actions.pickup_confirmed',
  ]),
  transport: new Set([
    'history.actions.harvest_started',
    'history.actions.progress_updated',
    'history.actions.progress_corrected',
    'history.actions.progress_corrected_with_reason',
    'history.actions.harvest_completed',
    'history.actions.pickup_confirmed',
    'history.actions.warehouse_received',
  ]),
  warehouse: new Set([
    'history.actions.pickup_confirmed',
    'history.actions.warehouse_received',
    'history.actions.order_completed',
  ]),
  viewer: new Set([
    'history.actions.order_created',
    'history.actions.farms_allocated',
    'history.actions.harvest_started',
    'history.actions.progress_updated',
    'history.actions.progress_corrected',
    'history.actions.progress_corrected_with_reason',
    'history.actions.harvest_completed',
    'history.actions.pickup_confirmed',
    'history.actions.warehouse_received',
    'history.actions.order_completed',
  ]),
};

interface OrderHistoryGroup {
  groupKey: string;
  orderId?: string;
  orderRef: string;
  order?: Order;
  events: HistoryEvent[];
  latestOccurredAt: string;
  createdAt?: string;
}

export function HistoryPage() {
  const { t } = useTranslation();
  const { state, currentRole, language } = useHarvestFlow();

  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('all');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // 1. Filter events visible to current user's role
  const roleEvents = useMemo(() => {
    if (currentRole === 'admin') return state.history;
    const allowed = ROLE_VISIBLE_ACTIONS[currentRole];
    return state.history.filter((ev) => allowed.has(ev.actionKey));
  }, [state.history, currentRole]);

  // 2. Group events by order
  const { orderGroups, generalEvents } = useMemo(() => {
    const groupsMap = new Map<string, OrderHistoryGroup>();
    const generals: HistoryEvent[] = [];

    // Pre-index existing orders for quick matching
    const ordersById = new Map(state.orders.map((o) => [o.id, o]));
    const ordersByRef = new Map(state.orders.map((o) => [o.reference.toLowerCase(), o]));

    for (const ev of roleEvents) {
      const order =
        (ev.orderId ? ordersById.get(ev.orderId) : undefined) ??
        (ev.orderRef ? ordersByRef.get(ev.orderRef.toLowerCase()) : undefined);

      const orderRef = ev.orderRef || order?.reference;

      if (!orderRef && !order) {
        generals.push(ev);
        continue;
      }

      const key = orderRef || order!.id;

      let group = groupsMap.get(key);
      if (!group) {
        group = {
          groupKey: key,
          orderId: order?.id ?? ev.orderId,
          orderRef: orderRef || order!.reference,
          order,
          events: [],
          latestOccurredAt: ev.occurredAt,
          createdAt: order?.createdAt,
        };
        groupsMap.set(key, group);
      }

      group.events.push(ev);

      if (!group.createdAt && ev.actionKey === 'history.actions.order_created') {
        group.createdAt = ev.occurredAt;
      }

      if (new Date(ev.occurredAt).getTime() > new Date(group.latestOccurredAt).getTime()) {
        group.latestOccurredAt = ev.occurredAt;
      }
    }

    // Sort events within each group chronologically (most recent first)
    for (const group of groupsMap.values()) {
      group.events.sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );

      // Infer creation date if not already assigned
      if (!group.createdAt && group.events.length > 0) {
        const createEv = group.events.find((e) => e.actionKey === 'history.actions.order_created');
        group.createdAt = createEv ? createEv.occurredAt : group.events[group.events.length - 1].occurredAt;
      }
    }

    // Sort groups so the order with the most recent activity appears first
    const sortedGroups = Array.from(groupsMap.values()).sort(
      (a, b) => new Date(b.latestOccurredAt).getTime() - new Date(a.latestOccurredAt).getTime(),
    );

    generals.sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    return { orderGroups: sortedGroups, generalEvents: generals };
  }, [roleEvents, state.orders]);

  // 3. Search and Creation Date filtering
  const filteredOrderGroups = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orderGroups.filter((group) => {
      // 1. Date of creation filter
      if (dateFilter !== 'all' && !isWithinDateRange(group.createdAt, dateFilter)) {
        return false;
      }

      // 2. Search query filter
      if (!q) return true;
      if (group.orderRef.toLowerCase().includes(q)) return true;
      if (group.order?.product.toLowerCase().includes(q)) return true;
      if (group.order?.notes && group.order.notes.toLowerCase().includes(q)) return true;
      return group.events.some(
        (ev) =>
          ev.actorName.toLowerCase().includes(q) ||
          t(ev.actionKey, ev.params).toLowerCase().includes(q),
      );
    });
  }, [orderGroups, search, dateFilter, t]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of filteredOrderGroups) {
      next[g.groupKey] = true;
    }
    setExpandedGroups(next);
  };

  const handleCollapseAll = () => {
    setExpandedGroups({});
  };

  const allExpanded =
    filteredOrderGroups.length > 0 &&
    filteredOrderGroups.every((g) => expandedGroups[g.groupKey]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">
            {t('history.pageTitle')}
          </h1>
          <p className="mt-1 text-sm text-[#5a6b60]">{t('history.pageSubtitle')}</p>
        </div>

        {orderGroups.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={allExpanded ? handleCollapseAll : handleExpandAll}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-900/15 bg-white px-3.5 text-xs font-semibold text-[#1b5e20] shadow-2xs transition hover:bg-emerald-50 active:scale-95"
            >
              <Layers className="h-4 w-4" />
              <span>{allExpanded ? t('history.collapseAll') : t('history.expandAll')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      {orderGroups.length > 0 && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6b60]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('history.searchPlaceholder')}
              className="w-full rounded-xl border border-emerald-900/12 bg-white py-2.5 pl-10 pr-4 text-sm text-[#1a241e] placeholder:text-[#5a6b60]/60 outline-none transition focus:border-[#1b5e20] focus:ring-2 focus:ring-emerald-700/10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-emerald-900/12 bg-white p-1 shadow-2xs">
            <span className="hidden items-center gap-1 px-2 text-xs font-semibold text-[#5a6b60] sm:inline-flex">
              <Calendar className="h-3.5 w-3.5 text-[#1b5e20]" />
              {t('common.filterByDate')}:
            </span>
            {(['all', 'today', 'week', 'month'] as const).map((key) => {
              const active = dateFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDateFilter(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-[#1b5e20] text-white shadow-2xs'
                      : 'text-[#5a6b60] hover:bg-emerald-50/60 hover:text-[#1a241e]'
                  }`}
                >
                  {key === 'all' && t('common.dateAll')}
                  {key === 'today' && t('common.dateToday')}
                  {key === 'week' && t('common.dateWeek')}
                  {key === 'month' && t('common.dateMonth')}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Grouped History List */}
      {roleEvents.length === 0 ? (
        <div className="rounded-2xl border border-emerald-900/10 bg-white p-10 text-center text-sm text-[#5a6b60]">
          {t('history.empty')}
        </div>
      ) : filteredOrderGroups.length === 0 && (search.trim() || dateFilter !== 'all') ? (
        <div className="rounded-2xl border border-emerald-900/10 bg-white p-10 text-center">
          <p className="text-sm text-[#5a6b60]">{t('history.noMatchingOrders')}</p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setDateFilter('all');
            }}
            className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-2 text-xs font-semibold text-[#1b5e20] transition hover:bg-emerald-100 active:scale-95"
          >
            <X className="h-3.5 w-3.5" />
            {t('common.resetFilters')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrderGroups.map((group) => {
            const isExpanded = Boolean(expandedGroups[group.groupKey]);
            const eventCount = group.events.length;
            const order = group.order;

            return (
              <article
                key={group.groupKey}
                className="overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-2xs transition hover:border-[#1b5e20]/30"
              >
                {/* Clickable Card Header (Accordion toggle with Arrow) */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.groupKey)}
                  aria-expanded={isExpanded}
                  className="flex w-full cursor-pointer flex-col gap-3 p-4 text-left transition hover:bg-[#fafcfa] sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  {/* Left: Reference, Product, Badges */}
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 sm:gap-3">
                    <span className="shrink-0 rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-bold text-[#1b5e20] ring-1 ring-emerald-700/15">
                      {group.orderRef}
                    </span>

                    {order ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-base font-bold text-[#1a241e]">
                          {order.product}
                        </span>
                        <span className="text-sm font-normal text-[#5a6b60]">
                          - {formatKg(order.quantityKg, language)}
                        </span>
                        <PriorityBadge priority={order.priority} />
                        <OrderStatusBadge status={order.status} />
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-[#1a241e]">
                        {t('common.details')}
                      </span>
                    )}

                    <span className="rounded-full bg-[#f6f9f6] px-2.5 py-0.5 text-xs font-medium text-[#5a6b60]">
                      {eventCount > 1
                        ? t('history.eventsCount_other', { count: eventCount })
                        : t('history.eventsCount_one', { count: eventCount })}
                    </span>
                  </div>

                  {/* Right: Created at + Latest activity time + Chevron Arrow */}
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 sm:justify-end">
                    {group.createdAt && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-[#5a6b60]">
                        <Calendar className="h-3.5 w-3.5 text-emerald-700/80" />
                        <span className="hidden xl:inline">{t('common.createdOn')}:</span>
                        <span className="font-medium text-[#1a241e]">
                          {formatDateTime(group.createdAt, language)}
                        </span>
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1.5 text-xs text-[#5a6b60]">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">{t('history.latestActivity')}:</span>
                      <span className="font-medium text-[#1a241e]">
                        {formatDateTime(group.latestOccurredAt, language)}
                      </span>
                    </span>

                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#1b5e20] transition group-hover:bg-emerald-100">
                      <ChevronDown
                        className={`h-4.5 w-4.5 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180 text-[#1b5e20]' : 'text-[#5a6b60]'
                        }`}
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </button>

                {/* Expanded Timeline of Order Events */}
                {isExpanded && (
                  <div className="border-t border-emerald-900/8 bg-[#fdfefd] p-4.5 sm:p-6">
                    {order?.notes && (
                      <div className="mb-4 rounded-xl border border-emerald-900/10 bg-[#f6f9f6] px-3.5 py-2 text-xs text-[#435349]">
                        <span className="font-semibold text-[#1a241e]">{t('common.notes')}: </span>
                        <span>{order.notes}</span>
                      </div>
                    )}

                    <ol className="relative ml-2 space-y-4 border-l-2 border-emerald-900/15 pl-5 sm:pl-6">
                      {group.events.map((ev) => (
                        <li key={ev.id} className="relative">
                          {/* Dot indicator on timeline */}
                          <span
                            className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-[#1b5e20] ring-2 ring-emerald-100"
                            aria-hidden="true"
                          />

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-bold text-[#1a241e]">{ev.actorName}</span>
                              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-[#1b5e20]">
                                {t(`rolesShort.${ev.actorRole}`)}
                              </span>
                            </div>

                            <span className="inline-flex items-center gap-1 text-xs text-[#5a6b60]">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {formatDateTime(ev.occurredAt, language)}
                            </span>
                          </div>

                          <p className="mt-1 text-sm leading-relaxed text-[#435349]">
                            {t(ev.actionKey, ev.params)}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </article>
            );
          })}

          {/* General Events without specific order reference (if any) */}
          {generalEvents.length > 0 && (
            <div className="mt-6 rounded-2xl border border-emerald-900/10 bg-white p-5">
              <h2 className="text-sm font-bold text-[#1a241e]">
                {t('history.generalEvents')} ({generalEvents.length})
              </h2>
              <ul className="mt-3 divide-y divide-emerald-900/8">
                {generalEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-[#1a241e]">{ev.actorName}</span>
                        <span className="text-[#5a6b60]">({t(`rolesShort.${ev.actorRole}`)})</span>
                      </div>
                      <p className="mt-0.5 text-sm text-[#435349]">
                        {t(ev.actionKey, ev.params)}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[#5a6b60]">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDateTime(ev.occurredAt, language)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
