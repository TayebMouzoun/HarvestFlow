import { BellRing, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import { ModalDialog } from '../ui/ModalDialog';

export function HarvestReminderPopup() {
  const { t } = useTranslation();
  const {
    reminderPopupNotifications,
    dismissReminderPopup,
    markNotificationRead,
    setActiveTab,
  } = useHarvestFlow();

  const open = reminderPopupNotifications.length > 0;

  const handleGoUpdate = () => {
    for (const n of reminderPopupNotifications) {
      markNotificationRead(n.id);
    }
    dismissReminderPopup();
    setActiveTab('workspace');
  };

  return (
    <ModalDialog
      open={open}
      onClose={dismissReminderPopup}
      title={t('harvest.reminderPopupTitle')}
      subtitle={t('harvest.reminderPopupSubtitle')}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4">
        <ul className="space-y-2.5">
          {reminderPopupNotifications.map((notif) => (
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
          ))}
        </ul>

        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={dismissReminderPopup}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-900/15 bg-white px-5 text-sm font-medium text-[#1a241e] hover:bg-emerald-50/50"
          >
            {t('harvest.reminderPopupLater')}
          </button>
          <button
            type="button"
            autoFocus
            onClick={handleGoUpdate}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1b5e20] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#144718]"
          >
            <Sprout className="h-4 w-4" />
            {t('harvest.reminderPopupAction')}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
