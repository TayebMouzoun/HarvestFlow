import { AlertTriangle, CheckCircle2, Clock, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { OrderPriority, OrderStatus } from '../../types/domain';

export function PriorityBadge({ priority }: { priority: OrderPriority }) {
  const { t } = useTranslation();
  if (priority === 'urgent') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-600/20">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        {t('common.urgent')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-700/15">
      {t('common.normal')}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();

  const styles: Record<OrderStatus, string> = {
    pending_allocation: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    allocated: 'bg-sky-50 text-sky-800 ring-sky-600/20',
    in_progress: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
    completed: 'bg-emerald-700 text-white ring-emerald-800/20',
  };

  const icons: Record<OrderStatus, React.ReactNode> = {
    pending_allocation: <Clock className="h-3.5 w-3.5" aria-hidden="true" />,
    allocated: <Clock className="h-3.5 w-3.5" aria-hidden="true" />,
    in_progress: <Sprout className="h-3.5 w-3.5" aria-hidden="true" />,
    completed: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${styles[status]}`}
    >
      {icons[status]}
      {t(`status.order.${status}`)}
    </span>
  );
}

export function ProgressBar({ value, highlight = 'green' }: { value: number; highlight?: 'green' | 'amber' }) {
  const clamped = Math.max(0, Math.min(100, value));
  const barColor =
    clamped >= 100
      ? 'bg-[#1b5e20]'
      : highlight === 'amber'
        ? 'bg-amber-500'
        : 'bg-emerald-600';

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-emerald-950/8">
      <div
        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
