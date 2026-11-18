import { useMemo, useState } from 'react';
import { Bell, CheckCircle2, Clock, History, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import type { FarmAllocation, Order } from '../../types/domain';
import { formatDateTime, formatKg } from '../../utils/format';
import { PriorityBadge, ProgressBar } from '../../components/ui/Badges';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { OrderHistoryModal } from '../../components/shared/OrderHistoryModal';

interface TransportItem {
  order: Order;
  alloc: FarmAllocation;
  farmName: string;
}

export function TransportView() {
  const { t } = useTranslation();
  const { state, language, confirmPickupDone, getFarmName } = useHarvestFlow();

  const [confirmItem, setConfirmItem] = useState<TransportItem | null>(null);
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null);

  const threshold = state.settings.transportPrepThresholdPct;

  const { readyItems, prepItems, inProgressItems, doneItems } = useMemo(() => {
    const all: TransportItem[] = [];
    for (const order of state.orders) {
      if (order.status !== 'in_progress' && order.status !== 'completed') continue;
      for (const alloc of order.allocations) {
        if (alloc.harvestStatus === 'pending') continue;
        all.push({
          order,
          alloc,
          farmName: getFarmName(alloc.farmId, alloc.farmNameSnapshot),
        });
      }
    }

    const sortByUrgent = (a: TransportItem, b: TransportItem) => {
      if (a.order.priority === 'urgent' && b.order.priority !== 'urgent') return -1;
      if (a.order.priority !== 'urgent' && b.order.priority === 'urgent') return 1;
      return b.alloc.currentProgressPct - a.alloc.currentProgressPct;
    };

    const ready = all
      .filter((i) => i.alloc.harvestStatus === 'completed' && !i.alloc.pickupDone)
      .sort(sortByUrgent);
    const prep = all
      .filter(
        (i) =>
          i.alloc.harvestStatus === 'in_progress' && i.alloc.currentProgressPct >= threshold,
      )
      .sort(sortByUrgent);
    const inProgress = all
      .filter(
        (i) =>
          i.alloc.harvestStatus === 'in_progress' && i.alloc.currentProgressPct < threshold,
      )
      .sort(sortByUrgent);
    const done = all
      .filter((i) => i.alloc.pickupDone)
      .sort(
        (a, b) =>
          new Date(b.alloc.pickupDoneAt ?? 0).getTime() -
          new Date(a.alloc.pickupDoneAt ?? 0).getTime(),
      );

    return {
      readyItems: ready,
      prepItems: prep,
      inProgressItems: inProgress,
      doneItems: done,
    };
  }, [state.orders, threshold, getFarmName]);

  const hasAnyActive = readyItems.length + prepItems.length + inProgressItems.length > 0;

  const renderCard = (item: TransportItem, bucket: 'ready' | 'prep' | 'progress' | 'done') => {
    const { order, alloc, farmName } = item;
    const isUrgent = order.priority === 'urgent' && bucket !== 'done';

    return (
      <article
        key={alloc.id}
        className={`rounded-2xl border bg-white p-5 shadow-2xs ${
          bucket === 'ready'
            ? 'border-emerald-300 ring-1 ring-emerald-600/15'
            : bucket === 'prep'
              ? 'border-amber-300 ring-1 ring-amber-500/15'
              : isUrgent
                ? 'border-red-200 ring-1 ring-red-500/10'
                : 'border-emerald-900/10'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-[#1b5e20]">{order.reference}</span>
              <PriorityBadge priority={order.priority} />
              {bucket === 'ready' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#1b5e20] px-2.5 py-1 text-xs font-semibold text-white">
                  <Truck className="h-3.5 w-3.5" />
                  {t('transport.readyBadge')}
                </span>
              )}
              {bucket === 'prep' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                  <Bell className="h-3.5 w-3.5" />
                  {t('transport.prepBadge')}
                </span>
              )}
              {bucket === 'done' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('status.pickup.done')}
                </span>
              )}
            </div>

            <h3 className="mt-2 text-lg font-semibold text-[#1a241e]">
              {farmName}
              <span className="ml-2 text-base font-normal text-[#5a6b60]">
                · {order.product} ({formatKg(alloc.allocatedQtyKg, language)})
              </span>
            </h3>
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

        <div className="mt-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#5a6b60]">{t('harvest.currentProgress')}</span>
            <span className="text-sm font-bold text-[#1b5e20]">{alloc.currentProgressPct}%</span>
          </div>
          <ProgressBar
            value={alloc.currentProgressPct}
            highlight={bucket === 'prep' ? 'amber' : 'green'}
          />
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-[#5a6b60]">
            {bucket === 'done' && alloc.pickupDoneAt ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {t('transport.collectedAt')} {formatDateTime(alloc.pickupDoneAt, language)}
                {alloc.receivedDone && (
                  <span className="ml-2 rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {t('status.warehouse.received')}
                  </span>
                )}
              </span>
            ) : alloc.lastProgressAt ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {t('harvest.lastUpdate')}: {formatDateTime(alloc.lastProgressAt, language)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {t('harvest.startedAt')} {formatDateTime(alloc.harvestStartedAt, language)}
              </span>
            )}
          </div>

          {bucket === 'ready' && (
            <button
              type="button"
              onClick={() => setConfirmItem(item)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1b5e20] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#144718]"
            >
              <CheckCircle2 className="h-4 w-4" />
              {t('transport.markDoneButton')}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">{t('transport.title')}</h1>
        <p className="mt-1 text-sm text-[#5a6b60]">{t('transport.subtitle')}</p>
      </div>

      {!hasAnyActive && doneItems.length === 0 ? (
        <div className="rounded-2xl border border-emerald-900/8 bg-white p-10 text-center text-sm text-[#5a6b60]">
          {t('transport.emptyQueue')}
        </div>
      ) : (
        <>
          {/* Ready 100% */}
          {readyItems.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#1b5e20]">
                <span>{t('transport.readySection')}</span>
                <span className="rounded-full bg-[#1b5e20] px-2.5 py-0.5 text-xs font-bold text-white">
                  {readyItems.length}
                </span>
              </h2>
              <div className="grid gap-4">{readyItems.map((i) => renderCard(i, 'ready'))}</div>
            </section>
          )}

          {/* Prep alert >= threshold */}
          {prepItems.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-amber-900">
                <span>{t('transport.prepSection', { threshold })}</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                  {prepItems.length}
                </span>
              </h2>
              <div className="grid gap-4">{prepItems.map((i) => renderCard(i, 'prep'))}</div>
            </section>
          )}

          {/* Early harvest progress */}
          {inProgressItems.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#1a241e]">
                <span>{t('transport.inProgressSection')}</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-[#1b5e20]">
                  {inProgressItems.length}
                </span>
              </h2>
              <div className="grid gap-4">
                {inProgressItems.map((i) => renderCard(i, 'progress'))}
              </div>
            </section>
          )}

          {/* Confirmed pickups */}
          {doneItems.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#5a6b60]">
                <span>{t('transport.doneSection')}</span>
                <span className="rounded-full bg-emerald-950/8 px-2.5 py-0.5 text-xs font-bold text-[#435349]">
                  {doneItems.length}
                </span>
              </h2>
              <div className="grid gap-3 opacity-90">
                {doneItems.map((i) => renderCard(i, 'done'))}
              </div>
            </section>
          )}
        </>
      )}

      <ConfirmModal
        open={Boolean(confirmItem)}
        title={t('transport.confirmDoneTitle')}
        body={
          confirmItem
            ? t('transport.confirmDoneBody', {
                qty: confirmItem.alloc.allocatedQtyKg,
                product: confirmItem.order.product,
                farm: confirmItem.farmName,
                ref: confirmItem.order.reference,
              })
            : ''
        }
        confirmLabel={t('transport.markDoneButton')}
        onConfirm={() => {
          if (confirmItem) {
            confirmPickupDone(confirmItem.order.id, confirmItem.alloc.id);
          }
          setConfirmItem(null);
        }}
        onCancel={() => setConfirmItem(null)}
      />

      <OrderHistoryModal order={historyOrder} onClose={() => setHistoryOrder(null)} />
    </div>
  );
}
