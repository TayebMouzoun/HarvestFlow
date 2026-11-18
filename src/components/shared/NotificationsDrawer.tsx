import { Bell, CheckCheck, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import { formatDateTime } from '../../utils/format';
import { ModalDialog } from '../ui/ModalDialog';

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationsDrawer({ open, onClose }: NotificationsDrawerProps) {
  const { t } = useTranslation();
  const { state, currentRole, language, markNotificationRead, markAllNotificationsRead } =
    useHarvestFlow();

  const isAdmin = currentRole === 'admin';
  const roleNotifications = isAdmin
    ? state.notifications
    : state.notifications.filter((n) => n.targetRole === currentRole);
  const unreadCount = roleNotifications.filter((n) => !n.isRead).length;

  const severityStyles = {
    urgent: 'border-l-red-600 bg-red-50/40',
    warning: 'border-l-amber-500 bg-amber-50/40',
    success: 'border-l-emerald-700 bg-emerald-50/40',
    info: 'border-l-emerald-500 bg-[#f6f9f6]',
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={t('notifications.title')}
      subtitle={`${t(`roles.${currentRole}`)} · ${t('notifications.unreadCount', { count: unreadCount })}`}
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-3">
        {unreadCount > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => markAllNotificationsRead(isAdmin ? 'all' : currentRole)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1b5e20] transition hover:bg-emerald-50"
            >
              <CheckCheck className="h-4 w-4" />
              {t('notifications.markAllRead')}
            </button>
          </div>
        )}

        {roleNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-[#5a6b60]">
            <Bell className="mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm">{t('notifications.empty')}</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {roleNotifications.map((notif) => (
              <li key={notif.id}>
                <button
                  type="button"
                  onClick={() => markNotificationRead(notif.id)}
                  className={`w-full rounded-xl border border-emerald-900/8 border-l-4 p-3.5 text-left transition hover:shadow-xs ${
                    notif.isRead
                      ? 'border-l-emerald-900/15 bg-white opacity-75'
                      : severityStyles[notif.severity]
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-[#1a241e]">
                      {!notif.isRead && (
                        <span
                          className="mr-2 inline-block h-2 w-2 rounded-full bg-[#1b5e20]"
                          aria-hidden="true"
                        />
                      )}
                      {t(notif.titleKey, notif.params)}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[#5a6b60]">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(notif.createdAt, language)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#435349]">{t(notif.messageKey, notif.params)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalDialog>
  );
}
