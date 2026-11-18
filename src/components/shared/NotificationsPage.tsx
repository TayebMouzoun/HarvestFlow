import { Bell, CheckCheck, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import { formatDateTime } from '../../utils/format';

export function NotificationsPage() {
  const { t } = useTranslation();
  const { state, currentRole, language, markNotificationRead, markAllNotificationsRead } =
    useHarvestFlow();

  const isAdmin = currentRole === 'admin';
  const notifications = isAdmin
    ? state.notifications
    : state.notifications.filter((n) => n.targetRole === currentRole);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const severityStyles = {
    urgent: 'border-l-red-600 bg-red-50/40',
    warning: 'border-l-amber-500 bg-amber-50/40',
    success: 'border-l-emerald-700 bg-emerald-50/40',
    info: 'border-l-emerald-500 bg-white',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">
            {t('notifications.title')}
          </h1>
          <p className="mt-1 text-sm text-[#5a6b60]">
            {isAdmin ? t('notifications.allSystemBadge') : t('notifications.subtitle')}
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllNotificationsRead(isAdmin ? 'all' : currentRole)}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-900/12 bg-white px-4 text-xs font-semibold text-[#1b5e20] transition hover:bg-emerald-50"
          >
            <CheckCheck className="h-4 w-4" />
            {t('notifications.markAllRead')} ({unreadCount})
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-900/8 bg-white py-14 text-center text-[#5a6b60]">
          <Bell className="mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">{t('notifications.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((notif) => (
            <li key={notif.id}>
              <button
                type="button"
                onClick={() => markNotificationRead(notif.id)}
                className={`w-full rounded-2xl border border-emerald-900/10 border-l-4 p-4 text-left shadow-2xs transition hover:shadow-xs ${
                  notif.isRead
                    ? 'border-l-emerald-900/15 bg-white opacity-75'
                    : severityStyles[notif.severity]
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {!notif.isRead && (
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full bg-[#1b5e20]"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-sm font-semibold text-[#1a241e]">
                      {t(notif.titleKey, notif.params)}
                    </span>
                    {isAdmin && (
                      <span className="rounded-full bg-emerald-950/6 px-2 py-0.5 text-[11px] font-semibold text-[#435349]">
                        → {t(`rolesShort.${notif.targetRole}`)}
                      </span>
                    )}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[#5a6b60]">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDateTime(notif.createdAt, language)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-[#435349]">
                  {t(notif.messageKey, notif.params)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
