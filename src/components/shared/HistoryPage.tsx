import { Clock } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import type { UserRole } from '../../types/domain';
import { formatDateTime } from '../../utils/format';

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

export function HistoryPage() {
  const { t } = useTranslation();
  const { state, currentRole, language } = useHarvestFlow();

  const events = useMemo(() => {
    if (currentRole === 'admin') return state.history;
    const allowed = ROLE_VISIBLE_ACTIONS[currentRole];
    return state.history.filter((ev) => allowed.has(ev.actionKey));
  }, [state.history, currentRole]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">
          {t('history.pageTitle')}
        </h1>
        <p className="mt-1 text-sm text-[#5a6b60]">{t('history.pageSubtitle')}</p>
      </div>

      <section className="rounded-2xl border border-emerald-900/10 bg-white p-5">
        {events.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#5a6b60]">{t('history.empty')}</p>
        ) : (
          <ul className="divide-y divide-emerald-900/8">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-col gap-1.5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {ev.orderRef && (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-[#1b5e20]">
                        {ev.orderRef}
                      </span>
                    )}
                    <span className="font-semibold text-[#1a241e]">{ev.actorName}</span>
                    <span className="text-[#5a6b60]">({t(`rolesShort.${ev.actorRole}`)})</span>
                  </div>
                  <p className="mt-1 text-sm text-[#435349]">{t(ev.actionKey, ev.params)}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[#5a6b60]">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDateTime(ev.occurredAt, language)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
