import { useEffect, useState } from 'react';
import { BellRing, Check, CheckCircle2, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import { formatKg } from '../../utils/format';
import { PriorityBadge, ProgressBar } from '../ui/Badges';
import { ModalDialog } from '../ui/ModalDialog';

export function HarvestReminderPopup() {
  const { t } = useTranslation();
  const {
    state,
    language,
    reminderPopupNotifications,
    dismissReminderPopup,
    markNotificationRead,
    updateFarmProgress,
    getFarmName,
    setActiveTab,
  } = useHarvestFlow();

  // Tracks the selected percentage awaiting inline confirmation per notification ID
  const [selectedPctByNotif, setSelectedPctByNotif] = useState<Record<string, number>>({});

  const open = reminderPopupNotifications.length > 0;

  useEffect(() => {
    if (!open) {
      setSelectedPctByNotif({});
    }
  }, [open]);

  const handleGoHarvests = () => {
    for (const n of reminderPopupNotifications) {
      markNotificationRead(n.id);
    }
    dismissReminderPopup();
    setActiveTab('workspace');
  };

  const handleSelectStep = (notifId: string, pct: number) => {
    setSelectedPctByNotif((prev) => ({ ...prev, [notifId]: pct }));
  };

  const handleCancelSelection = (notifId: string) => {
    setSelectedPctByNotif((prev) => {
      const next = { ...prev };
      delete next[notifId];
      return next;
    });
  };

  const handleConfirmProgress = (
    notifId: string,
    orderId: string,
    allocationId: string,
    newPct: number,
  ) => {
    updateFarmProgress(orderId, allocationId, newPct);
    markNotificationRead(notifId);
    handleCancelSelection(notifId);
    dismissReminderPopup(notifId);
  };

  return (
    <ModalDialog
      open={open}
      onClose={() => dismissReminderPopup()}
      title={t('harvest.reminderPopupTitle')}
      subtitle={t('harvest.reminderPopupSubtitle')}
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-4">
        <ul className="max-h-[60vh] space-y-3 overflow-y-auto pr-0.5">
          {reminderPopupNotifications.map((notif) => {
            const order = notif.orderId
              ? state.orders.find((o) => o.id === notif.orderId)
              : undefined;
            const alloc =
              order && notif.allocationId
                ? order.allocations.find((a) => a.id === notif.allocationId)
                : undefined;

            if (!order || !alloc) {
              return (
                <li
                  key={notif.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                    <BellRing className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                    <span>{t(notif.titleKey, notif.params)}</span>
                  </div>
                  <p className="mt-1 text-sm text-amber-900">
                    {t(notif.messageKey, notif.params)}
                  </p>
                </li>
              );
            }

            const farmName = getFarmName(alloc.farmId, alloc.farmNameSnapshot);
            const currentPct = alloc.currentProgressPct;
            const isComplete = alloc.harvestStatus === 'completed' || currentPct >= 100;
            const forwardSteps = state.settings.progressSteps.filter((step) => step > currentPct);
            const selectedPct = selectedPctByNotif[notif.id];

            return (
              <li
                key={notif.id}
                className="rounded-2xl border border-amber-200 bg-[#fffdf7] p-4 shadow-2xs"
              >
                {/* Header: Order ref, priority, farm name, live percentage */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800">
                        <BellRing className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {order.reference}
                      </span>
                      <PriorityBadge priority={order.priority} />
                    </div>
                    <h4 className="mt-1 truncate text-base font-bold text-[#1a241e]">
                      {farmName}
                    </h4>
                    <p className="text-xs text-[#5a6b60]">
                      {order.product} · {formatKg(alloc.allocatedQtyKg, language)}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-xl bg-emerald-50 px-3 py-1.5 text-lg font-bold text-[#1b5e20] ring-1 ring-emerald-700/15">
                    {currentPct}%
                  </span>
                </div>

                {/* Live progress bar */}
                <div className="mt-3">
                  <ProgressBar
                    value={currentPct}
                    highlight={
                      currentPct >= state.settings.transportPrepThresholdPct && currentPct < 100
                        ? 'amber'
                        : 'green'
                    }
                  />
                </div>

                {isComplete ? (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      {t('harvest.reminderPopupAlreadyDone')}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        markNotificationRead(notif.id);
                        dismissReminderPopup(notif.id);
                      }}
                      className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-700/20 hover:bg-emerald-100"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <div className="mt-3.5 space-y-2.5">
                    <span className="block text-xs font-medium text-[#5a6b60]">
                      {t('harvest.reminderPopupSelectStep')}
                    </span>

                    <div className="flex flex-wrap gap-2">
                      {forwardSteps.map((step) => {
                        const isSelected = selectedPct === step;
                        const isFinal = step === 100;
                        return (
                          <button
                            key={step}
                            type="button"
                            onClick={() => handleSelectStep(notif.id, step)}
                            className={`min-h-11 min-w-15 rounded-xl border px-3.5 text-sm font-bold transition ${
                              isSelected
                                ? 'border-[#1b5e20] bg-[#1b5e20] text-white shadow-xs ring-2 ring-emerald-700/25'
                                : isFinal
                                  ? 'border-emerald-700/35 bg-emerald-50/70 text-[#1b5e20] hover:bg-[#1b5e20] hover:text-white'
                                  : 'border-emerald-900/15 bg-white text-[#1a241e] hover:border-[#1b5e20] hover:bg-emerald-50/60'
                            }`}
                          >
                            {step}%
                          </button>
                        );
                      })}
                    </div>

                    {/* Inline two-step confirmation bar */}
                    {selectedPct !== undefined && (
                      <div className="rounded-xl border border-emerald-700/20 bg-emerald-50/75 p-3">
                        <p className="text-xs font-semibold text-emerald-950">
                          {t('harvest.reminderPopupConfirmLine', {
                            prev: currentPct,
                            pct: selectedPct,
                          })}
                        </p>
                        {selectedPct === 100 && (
                          <p className="mt-1 text-xs text-emerald-900">
                            {t('harvest.confirmCompleteExtra').trim()}
                          </p>
                        )}
                        <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelSelection(notif.id)}
                            className="inline-flex min-h-9 items-center rounded-lg border border-emerald-900/15 bg-white px-3 text-xs font-medium text-[#1a241e] hover:bg-emerald-50"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleConfirmProgress(notif.id, order.id, alloc.id, selectedPct)
                            }
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#1b5e20] px-3.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#144718]"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {t('harvest.reminderPopupConfirmBtn', { pct: selectedPct })}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col-reverse gap-2.5 border-t border-emerald-900/8 pt-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={() => dismissReminderPopup()}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-900/15 bg-white px-4 text-sm font-medium text-[#1a241e] hover:bg-emerald-50/50"
          >
            {t('harvest.reminderPopupLater')}
          </button>
          <button
            type="button"
            onClick={handleGoHarvests}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-700/25 bg-emerald-50/60 px-4 text-sm font-semibold text-[#1b5e20] transition hover:bg-emerald-100/70"
          >
            <Sprout className="h-4 w-4" />
            {t('harvest.reminderPopupOpenHarvests')}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
