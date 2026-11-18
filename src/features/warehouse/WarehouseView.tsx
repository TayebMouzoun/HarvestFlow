import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, History, PackageCheck, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import type { FarmAllocation, Order } from '../../types/domain';
import { formatDateTime, formatKg } from '../../utils/format';
import { OrderStatusBadge, PriorityBadge } from '../../components/ui/Badges';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { OrderHistoryModal } from '../../components/shared/OrderHistoryModal';

interface DeliveryItem {
  order: Order;
  alloc: FarmAllocation;
  farmName: string;
}

export function WarehouseView() {
  const { t } = useTranslation();
  const { state, language, confirmWarehouseReceived, getFarmName } = useHarvestFlow();

  const [confirmItem, setConfirmItem] = useState<DeliveryItem | null>(null);
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null);

  const { incoming, received } = useMemo(() => {
    const all: DeliveryItem[] = [];
    for (const order of state.orders) {
      for (const alloc of order.allocations) {
        if (!alloc.pickupDone) continue;
        all.push({
          order,
          alloc,
          farmName: getFarmName(alloc.farmId, alloc.farmNameSnapshot),
        });
      }
    }

    const incomingList = all
      .filter((i) => !i.alloc.receivedDone)
      .sort((a, b) => {
        if (a.order.priority === 'urgent' && b.order.priority !== 'urgent') return -1;
        if (a.order.priority !== 'urgent' && b.order.priority === 'urgent') return 1;
        return (
          new Date(b.alloc.pickupDoneAt ?? 0).getTime() -
          new Date(a.alloc.pickupDoneAt ?? 0).getTime()
        );
      });

    const receivedList = all
      .filter((i) => i.alloc.receivedDone)
      .sort(
        (a, b) =>
          new Date(b.alloc.receivedDoneAt ?? 0).getTime() -
          new Date(a.alloc.receivedDoneAt ?? 0).getTime(),
      );

    return { incoming: incomingList, received: receivedList };
  }, [state.orders, getFarmName]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">{t('warehouse.title')}</h1>
        <p className="mt-1 text-sm text-[#5a6b60]">{t('warehouse.subtitle')}</p>
      </div>

      {/* Expected deliveries */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#1a241e]">
          <span>{t('warehouse.incomingSection')}</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-[#1b5e20]">
            {incoming.length}
          </span>
        </h2>

        {incoming.length === 0 ? (
          <div className="rounded-2xl border border-emerald-900/8 bg-white p-8 text-center text-sm text-[#5a6b60]">
            {t('warehouse.emptyIncoming')}
          </div>
        ) : (
          <div className="grid gap-4">
            {incoming.map((item) => (
              <article
                key={item.alloc.id}
                className={`rounded-2xl border bg-white p-5 shadow-2xs ${
                  item.order.priority === 'urgent'
                    ? 'border-red-200 ring-1 ring-red-500/10'
                    : 'border-emerald-900/10'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#1b5e20]">
                        {item.order.reference}
                      </span>
                      <PriorityBadge priority={item.order.priority} />
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                        <Truck className="h-3.5 w-3.5" />
                        {t('status.warehouse.in_transit')}
                      </span>
                    </div>

                    <h3 className="mt-2 text-lg font-semibold text-[#1a241e]">
                      {item.order.product}{' '}
                      <span className="font-normal text-[#5a6b60]">
                        — {formatKg(item.alloc.allocatedQtyKg, language)}
                      </span>
                    </h3>
                    <p className="mt-1 text-sm font-medium text-[#435349]">{item.farmName}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setHistoryOrder(item.order)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-900/12 px-3 text-xs font-semibold text-[#435349] hover:bg-emerald-50"
                  >
                    <History className="h-4 w-4" />
                    {t('common.viewHistory')}
                  </button>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-emerald-900/8 pt-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#5a6b60]">
                    <Clock className="h-3.5 w-3.5" />
                    {t('warehouse.collectedAt')}{' '}
                    {formatDateTime(item.alloc.pickupDoneAt, language)}
                  </span>

                  <button
                    type="button"
                    onClick={() => setConfirmItem(item)}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1b5e20] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#144718]"
                  >
                    <PackageCheck className="h-4 w-4" />
                    {t('warehouse.markReceivedButton')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Confirmed receptions */}
      {received.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#5a6b60]">
            <span>{t('warehouse.receivedSection')}</span>
            <span className="rounded-full bg-emerald-950/8 px-2.5 py-0.5 text-xs font-bold text-[#435349]">
              {received.length}
            </span>
          </h2>

          <div className="grid gap-3">
            {received.map((item) => (
              <article
                key={item.alloc.id}
                className="rounded-2xl border border-emerald-900/8 bg-white p-4 shadow-2xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#1b5e20]">{item.order.reference}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('status.warehouse.received')}
                    </span>
                    {item.order.status === 'completed' && (
                      <OrderStatusBadge status="completed" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setHistoryOrder(item.order)}
                    className="text-xs font-semibold text-[#1b5e20] hover:underline"
                  >
                    {t('common.viewHistory')}
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-[#1a241e]">
                    {item.farmName} · {item.order.product} (
                    {formatKg(item.alloc.allocatedQtyKg, language)})
                  </span>
                  <span className="text-xs text-[#5a6b60]">
                    {t('warehouse.receivedAt')}{' '}
                    {formatDateTime(item.alloc.receivedDoneAt, language)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <ConfirmModal
        open={Boolean(confirmItem)}
        title={t('warehouse.confirmReceivedTitle')}
        body={
          confirmItem
            ? t('warehouse.confirmReceivedBody', {
                qty: confirmItem.alloc.allocatedQtyKg,
                product: confirmItem.order.product,
                farm: confirmItem.farmName,
                ref: confirmItem.order.reference,
              })
            : ''
        }
        confirmLabel={t('warehouse.markReceivedButton')}
        onConfirm={() => {
          if (confirmItem) {
            confirmWarehouseReceived(confirmItem.order.id, confirmItem.alloc.id);
          }
          setConfirmItem(null);
        }}
        onCancel={() => setConfirmItem(null)}
      />

      <OrderHistoryModal order={historyOrder} onClose={() => setHistoryOrder(null)} />
    </div>
  );
}
