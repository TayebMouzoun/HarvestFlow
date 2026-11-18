import { useMemo, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Clock,
  History,
  Play,
  Plus,
  Sprout,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import type { FarmAllocation, Order } from '../../types/domain';
import { formatDateTime, formatKg, formatTime } from '../../utils/format';
import { OrderStatusBadge, PriorityBadge, ProgressBar } from '../../components/ui/Badges';
import { ModalDialog } from '../../components/ui/ModalDialog';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { OrderHistoryModal } from '../../components/shared/OrderHistoryModal';

interface AllocationRow {
  farmId: string;
  qty: string;
}

export function FarmCoordinatorView() {
  const { t } = useTranslation();
  const {
    state,
    language,
    saveOrderAllocations,
    startHarvesting,
    updateFarmProgress,
    correctFarmProgress,
    triggerActiveReminders,
    getFarmName,
  } = useHarvestFlow();

  const [allocatingOrder, setAllocatingOrder] = useState<Order | null>(null);
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [allocError, setAllocError] = useState<string | null>(null);
  const [startTargetOrder, setStartTargetOrder] = useState<Order | null>(null);
  const [progressConfirm, setProgressConfirm] = useState<{
    order: Order;
    alloc: FarmAllocation;
    nextPct: number;
  } | null>(null);
  const [correctionConfirm, setCorrectionConfirm] = useState<{
    order: Order;
    alloc: FarmAllocation;
    correctedPct: number;
  } | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null);

  const activeFarms = useMemo(() => state.farms.filter((f) => f.isActive), [state.farms]);

  const sortUrgentFirst = (a: Order, b: Order) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
    if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  const pendingAndPlannedOrders = useMemo(
    () =>
      state.orders
        .filter((o) => o.status === 'pending_allocation' || o.status === 'allocated')
        .sort(sortUrgentFirst),
    [state.orders],
  );

  const activeHarvestOrders = useMemo(
    () => state.orders.filter((o) => o.status === 'in_progress').sort(sortUrgentFirst),
    [state.orders],
  );

  const openAllocationModal = (order: Order) => {
    setAllocError(null);
    if (order.allocations.length > 0) {
      setRows(
        order.allocations.map((a) => ({
          farmId: a.farmId,
          qty: String(a.allocatedQtyKg),
        })),
      );
    } else if (activeFarms.length > 0) {
      setRows([{ farmId: activeFarms[0].id, qty: String(order.quantityKg) }]);
    } else {
      setRows([]);
    }
    setAllocatingOrder(order);
  };

  const allocatedSum = rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  const remainingQty = allocatingOrder ? allocatingOrder.quantityKg - allocatedSum : 0;

  const handleAddRow = () => {
    const usedIds = new Set(rows.map((r) => r.farmId));
    const nextFarm = activeFarms.find((f) => !usedIds.has(f.id));
    if (!nextFarm) return;
    setRows((prev) => [
      ...prev,
      { farmId: nextFarm.id, qty: remainingQty > 0 ? String(remainingQty) : '' },
    ]);
  };

  const handleSavePlan = () => {
    if (!allocatingOrder) return;
    setAllocError(null);
    const cleaned = rows
      .map((r) => ({ farmId: r.farmId, allocatedQtyKg: Math.round(Number(r.qty) || 0) }))
      .filter((r) => r.farmId && r.allocatedQtyKg > 0);

    if (cleaned.length === 0) {
      setAllocError(t('harvest.validationAllocationEmpty'));
      return;
    }

    const total = cleaned.reduce((s, r) => s + r.allocatedQtyKg, 0);
    if (total !== allocatingOrder.quantityKg) {
      setAllocError(
        t('harvest.validationAllocationMismatch', {
          allocated: total,
          requested: allocatingOrder.quantityKg,
        }),
      );
      return;
    }

    saveOrderAllocations(allocatingOrder.id, cleaned);
    setAllocatingOrder(null);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">{t('harvest.title')}</h1>
          <p className="mt-1 text-sm text-[#5a6b60]">{t('harvest.subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={() => triggerActiveReminders()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
        >
          <BellRing className="h-4 w-4" />
          {t('harvest.simulateReminder')} ({t('common.everyMinutes', {
            count: state.settings.reminderIntervalMinutes,
          })})
        </button>
      </div>

      {/* Section 1: Pending Allocation & Ready to Start */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#1a241e]">
          <span>{t('harvest.pendingTitle')}</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-[#1b5e20]">
            {pendingAndPlannedOrders.length}
          </span>
        </h2>

        {pendingAndPlannedOrders.length === 0 ? (
          <div className="rounded-2xl border border-emerald-900/8 bg-white p-6 text-center text-sm text-[#5a6b60]">
            {t('harvest.pendingEmpty')}
          </div>
        ) : (
          <div className="grid gap-4">
            {pendingAndPlannedOrders.map((order) => (
              <article
                key={order.id}
                className={`rounded-2xl border bg-white p-5 shadow-2xs ${
                  order.priority === 'urgent'
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
                        - {formatKg(order.quantityKg, language)}
                      </span>
                    </h3>
                    {order.notes && <p className="mt-1.5 text-sm text-[#5a6b60]">{order.notes}</p>}
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

                {order.status === 'pending_allocation' ? (
                  <div className="mt-4 pt-3 border-t border-emerald-900/8">
                    <button
                      type="button"
                      onClick={() => openAllocationModal(order)}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1b5e20] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#144718] sm:w-auto"
                    >
                      <Sprout className="h-4 w-4" />
                      {t('harvest.allocateButton')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3 border-t border-emerald-900/8 pt-4">
                    <div className="flex flex-wrap gap-2">
                      {order.allocations.map((a) => (
                        <div
                          key={a.id}
                          className="rounded-xl border border-emerald-900/10 bg-[#f6f9f6] px-3.5 py-2 text-sm"
                        >
                          <span className="font-semibold text-[#1a241e]">
                            {getFarmName(a.farmId, a.farmNameSnapshot)}
                          </span>
                          <span className="ml-2 text-[#5a6b60]">
                            {formatKg(a.allocatedQtyKg, language)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl bg-sky-50 px-3.5 py-2.5 text-xs font-medium text-sky-900">
                      {t('harvest.notStartedNotice')}
                    </div>

                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => setStartTargetOrder(order)}
                        className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1b5e20] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#144718] sm:flex-initial"
                      >
                        <Play className="h-4 w-4 fill-current" />
                        {t('harvest.startHarvestButton')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openAllocationModal(order)}
                        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-900/15 bg-white px-4 text-sm font-medium text-[#1a241e] hover:bg-emerald-50/60"
                      >
                        {t('harvest.editAllocationButton')}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Active Harvests */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#1a241e]">
          <span>{t('harvest.activeTitle')}</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-[#1b5e20]">
            {activeHarvestOrders.length}
          </span>
        </h2>

        {activeHarvestOrders.length === 0 ? (
          <div className="rounded-2xl border border-emerald-900/8 bg-white p-8 text-center text-sm text-[#5a6b60]">
            {t('harvest.activeEmpty')}
          </div>
        ) : (
          <div className="grid gap-5">
            {activeHarvestOrders.map((order) => (
              <article
                key={order.id}
                className={`rounded-2xl border bg-white p-5 shadow-2xs ${
                  order.priority === 'urgent'
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
                        - {formatKg(order.quantityKg, language)}
                      </span>
                    </h3>
                    {order.harvestStartedAt && (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#5a6b60]">
                        <Clock className="h-3.5 w-3.5" />
                        {t('harvest.startedAt')} {formatDateTime(order.harvestStartedAt, language)}
                      </p>
                    )}
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

                {/* Per-farm progress cards */}
                <div className="mt-4 grid gap-3">
                  {order.allocations.map((alloc) => {
                    const farmName = getFarmName(alloc.farmId, alloc.farmNameSnapshot);
                    const isComplete = alloc.harvestStatus === 'completed';

                    return (
                      <div
                        key={alloc.id}
                        className={`rounded-xl border p-4 ${
                          isComplete
                            ? 'border-emerald-200 bg-emerald-50/40'
                            : 'border-emerald-900/10 bg-[#fafcfa]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-base font-semibold text-[#1a241e]">{farmName}</h4>
                            <p className="text-xs text-[#5a6b60]">
                              {formatKg(alloc.allocatedQtyKg, language)}
                              {alloc.lastProgressAt &&
                                ` · ${t('harvest.lastUpdate')}: ${formatTime(alloc.lastProgressAt, language)}`}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                isComplete
                                  ? 'bg-emerald-700 text-white'
                                  : 'bg-amber-50 text-amber-800 ring-1 ring-amber-600/20'
                              }`}
                            >
                              {isComplete
                                ? t('harvest.remindersStopped')
                                : t('harvest.remindersActive', {
                                    interval: state.settings.reminderIntervalMinutes,
                                  })}
                            </span>
                            <span className="text-lg font-bold text-[#1b5e20]">
                              {alloc.currentProgressPct}%
                            </span>
                          </div>
                        </div>

                        <div className="mt-3">
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

                        {isComplete ? (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
                              <CheckCircle2 className="h-4 w-4" />
                              {t('status.harvest.completed')} ·{' '}
                              {formatTime(alloc.harvestCompletedAt, language)}
                            </span>
                            <div className="flex gap-2">
                              {alloc.pickupDone && (
                                <span className="rounded-full bg-white px-2.5 py-0.5 font-medium text-emerald-800 ring-1 ring-emerald-700/15">
                                  {t('status.pickup.done')}
                                </span>
                              )}
                              {alloc.receivedDone && (
                                <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 font-medium text-white">
                                  {t('status.warehouse.received')}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3.5">
                            <span className="block text-xs font-medium text-[#5a6b60]">
                              {t('harvest.progressLabel')}:
                            </span>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {state.settings.progressSteps.map((step) => {
                                const isCurrent = alloc.currentProgressPct === step;
                                const isLower = step < alloc.currentProgressPct;
                                return (
                                  <button
                                    key={step}
                                    type="button"
                                    disabled={isCurrent}
                                    onClick={() => {
                                      if (isLower) {
                                        setCorrectionReason('');
                                        setCorrectionConfirm({
                                          order,
                                          alloc,
                                          correctedPct: step,
                                        });
                                      } else {
                                        setProgressConfirm({ order, alloc, nextPct: step });
                                      }
                                    }}
                                    className={`min-h-12 min-w-[74px] flex-1 rounded-xl px-4 text-sm font-bold transition sm:flex-initial ${
                                      isCurrent
                                        ? 'cursor-default bg-[#1b5e20] text-white'
                                        : isLower
                                          ? 'border border-amber-300/80 bg-amber-50/60 text-amber-900 hover:bg-amber-100/80'
                                          : step === 100
                                            ? 'border-2 border-[#1b5e20] bg-white text-[#1b5e20] hover:bg-emerald-50'
                                            : 'border border-emerald-900/15 bg-white text-[#1a241e] hover:border-[#1b5e20] hover:bg-emerald-50/50'
                                    }`}
                                  >
                                    {step}%
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Farm Allocation Modal */}
      <ModalDialog
        open={Boolean(allocatingOrder)}
        onClose={() => setAllocatingOrder(null)}
        title={
          allocatingOrder
            ? t('harvest.allocationModalTitle', { ref: allocatingOrder.reference })
            : ''
        }
        subtitle={
          allocatingOrder
            ? `${allocatingOrder.product} - ${formatKg(allocatingOrder.quantityKg, language)}`
            : undefined
        }
        maxWidthClass="max-w-xl"
      >
        {allocatingOrder && (
          <div className="space-y-4">
            {/* Running balance bar */}
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#f6f9f6] p-3 text-center">
              <div>
                <div className="text-[11px] font-medium text-[#5a6b60]">
                  {t('harvest.requestedTotal')}
                </div>
                <div className="mt-0.5 text-sm font-bold text-[#1a241e]">
                  {formatKg(allocatingOrder.quantityKg, language)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#5a6b60]">
                  {t('harvest.allocatedTotal')}
                </div>
                <div className="mt-0.5 text-sm font-bold text-[#1b5e20]">
                  {formatKg(allocatedSum, language)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#5a6b60]">
                  {t('harvest.remaining')}
                </div>
                <div
                  className={`mt-0.5 text-sm font-bold ${
                    remainingQty === 0
                      ? 'text-emerald-700'
                      : remainingQty < 0
                        ? 'text-red-600'
                        : 'text-amber-700'
                  }`}
                >
                  {remainingQty === 0
                    ? t('harvest.balanced')
                    : remainingQty < 0
                      ? t('harvest.overAllocated', { qty: Math.abs(remainingQty) })
                      : formatKg(remainingQty, language)}
                </div>
              </div>
            </div>

            {activeFarms.length === 0 ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                {t('harvest.noActiveFarms')}
              </p>
            ) : (
              <div className="space-y-2.5">
                {rows.map((row, idx) => {
                  const usedByOthers = new Set(
                    rows.filter((_, i) => i !== idx).map((r) => r.farmId),
                  );
                  return (
                    <div
                      key={`${row.farmId}-${idx}`}
                      className="flex flex-col gap-2 rounded-xl border border-emerald-900/12 p-3 sm:flex-row sm:items-center"
                    >
                      <select
                        value={row.farmId}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, farmId: e.target.value } : r)),
                          )
                        }
                        className="min-h-11 flex-1 rounded-lg border border-emerald-900/15 bg-white px-3 text-sm font-medium text-[#1a241e] outline-none focus:border-[#1b5e20]"
                      >
                        {activeFarms.map((farm) => (
                          <option
                            key={farm.id}
                            value={farm.id}
                            disabled={usedByOthers.has(farm.id)}
                          >
                            {farm.name}
                            {farm.code ? ` (${farm.code})` : ''}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={row.qty}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, qty: e.target.value } : r)),
                            )
                          }
                          placeholder="kg"
                          className="min-h-11 w-full rounded-lg border border-emerald-900/15 px-3 text-sm font-semibold text-[#1a241e] outline-none focus:border-[#1b5e20] sm:w-32"
                        />
                        <span className="text-xs font-medium text-[#5a6b60]">kg</span>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                            aria-label={t('common.cancel')}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {rows.length < activeFarms.length && (
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-800/30 text-sm font-semibold text-[#1b5e20] transition hover:bg-emerald-50/50"
                  >
                    <Plus className="h-4 w-4" />
                    {t('harvest.selectFarmPlaceholder')}
                  </button>
                )}
              </div>
            )}

            <p className="text-xs text-[#5a6b60]">{t('harvest.savePlanHint')}</p>

            {allocError && (
              <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                {allocError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setAllocatingOrder(null)}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-900/15 bg-white px-5 text-sm font-medium text-[#1a241e] hover:bg-emerald-50/50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSavePlan}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#1b5e20] px-6 text-sm font-semibold text-white shadow-sm hover:bg-[#144718]"
              >
                {t('harvest.savePlanButton')}
              </button>
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Confirm Start Harvesting Modal */}
      <ConfirmModal
        open={Boolean(startTargetOrder)}
        title={
          startTargetOrder
            ? t('harvest.startHarvestConfirmTitle', { ref: startTargetOrder.reference })
            : ''
        }
        body={t('harvest.startHarvestConfirmBody', {
          interval: state.settings.reminderIntervalMinutes,
        })}
        confirmLabel={t('harvest.startHarvestButton')}
        onConfirm={() => {
          if (startTargetOrder) startHarvesting(startTargetOrder.id);
          setStartTargetOrder(null);
        }}
        onCancel={() => setStartTargetOrder(null)}
      />

      {/* Confirm Progress Update Modal */}
      <ConfirmModal
        open={Boolean(progressConfirm)}
        title={
          progressConfirm
            ? t('harvest.confirmProgressTitle', { pct: progressConfirm.nextPct })
            : ''
        }
        body={
          progressConfirm
            ? `${t('harvest.confirmProgressBody', {
                farm: getFarmName(
                  progressConfirm.alloc.farmId,
                  progressConfirm.alloc.farmNameSnapshot,
                ),
                ref: progressConfirm.order.reference,
                prev: progressConfirm.alloc.currentProgressPct,
                pct: progressConfirm.nextPct,
              })}${progressConfirm.nextPct === 100 ? t('harvest.confirmCompleteExtra') : ''}`
            : ''
        }
        onConfirm={() => {
          if (progressConfirm) {
            updateFarmProgress(
              progressConfirm.order.id,
              progressConfirm.alloc.id,
              progressConfirm.nextPct,
            );
          }
          setProgressConfirm(null);
        }}
        onCancel={() => setProgressConfirm(null)}
      />

      {/* Explicit Downward Progress Correction Confirmation Modal */}
      <ModalDialog
        open={Boolean(correctionConfirm)}
        onClose={() => setCorrectionConfirm(null)}
        title={
          correctionConfirm
            ? t('harvest.correctProgressTitle', { pct: correctionConfirm.correctedPct })
            : ''
        }
        maxWidthClass="max-w-md"
      >
        {correctionConfirm && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-sm leading-relaxed text-amber-950">
              {t('harvest.correctProgressWarning', {
                prev: correctionConfirm.alloc.currentProgressPct,
                pct: correctionConfirm.correctedPct,
                farm: getFarmName(
                  correctionConfirm.alloc.farmId,
                  correctionConfirm.alloc.farmNameSnapshot,
                ),
                ref: correctionConfirm.order.reference,
              })}
            </div>

            {(correctionConfirm.alloc.prepAlertSent ||
              correctionConfirm.alloc.currentProgressPct >=
                state.settings.transportPrepThresholdPct) && (
              <p className="text-xs font-medium text-amber-900">
                {t('harvest.correctProgressTransportNotice')}
              </p>
            )}

            <div>
              <label
                htmlFor="progress-correction-reason"
                className="block text-sm font-medium text-[#1a241e]"
              >
                {t('harvest.correctProgressReasonLabel')}
              </label>
              <input
                id="progress-correction-reason"
                type="text"
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder={t('harvest.correctProgressReasonPlaceholder')}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-emerald-900/15 bg-white px-3.5 text-sm text-[#1a241e] outline-none focus:border-[#1b5e20]"
              />
            </div>

            <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                autoFocus
                onClick={() => setCorrectionConfirm(null)}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-900/15 bg-white px-5 text-sm font-medium text-[#1a241e] hover:bg-emerald-50/50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  correctFarmProgress(
                    correctionConfirm.order.id,
                    correctionConfirm.alloc.id,
                    correctionConfirm.correctedPct,
                    correctionReason,
                  );
                  setCorrectionConfirm(null);
                  setCorrectionReason('');
                }}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
              >
                {t('harvest.correctProgressConfirmButton')}
              </button>
            </div>
          </div>
        )}
      </ModalDialog>

      <OrderHistoryModal order={historyOrder} onClose={() => setHistoryOrder(null)} />
    </div>
  );
}
