import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import type { Order } from '../../types/domain';
import { formatDateTime, formatKg } from '../../utils/format';
import { ModalDialog } from '../ui/ModalDialog';
import { OrderStatusBadge, PriorityBadge } from '../ui/Badges';

interface OrderHistoryModalProps {
  order: Order | null;
  onClose: () => void;
}

export function OrderHistoryModal({ order, onClose }: OrderHistoryModalProps) {
  const { t } = useTranslation();
  const { state, language } = useHarvestFlow();

  const events = order
    ? [...state.history]
        .filter((h) => h.orderId === order.id || (order.reference && h.orderRef === order.reference))
        .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    : [];

  return (
    <ModalDialog
      open={Boolean(order)}
      onClose={onClose}
      title={order ? `${t('history.title')} - ${order.reference}` : t('history.title')}
      subtitle={order ? `${order.product} · ${formatKg(order.quantityKg, language)}` : undefined}
      maxWidthClass="max-w-xl"
    >
      {order && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={order.priority} />
            <OrderStatusBadge status={order.status} />
          </div>

          {order.notes && (
            <div className="rounded-xl bg-[#f6f9f6] px-4 py-3 text-sm text-[#435349]">
              <span className="font-medium text-[#1a241e]">{t('common.notes')}: </span>
              {order.notes}
            </div>
          )}

          {events.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#5a6b60]">{t('history.empty')}</p>
          ) : (
            <ol className="relative ml-2 space-y-4 border-l-2 border-emerald-900/12 pl-5">
              {events.map((ev) => (
                <li key={ev.id} className="relative">
                  <span
                    className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-[#1b5e20] ring-2 ring-emerald-100"
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-emerald-900">
                      {ev.actorName} · {t(`rolesShort.${ev.actorRole}`)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-[#5a6b60]">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatDateTime(ev.occurredAt, language)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#1a241e]">{t(ev.actionKey, ev.params)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </ModalDialog>
  );
}
