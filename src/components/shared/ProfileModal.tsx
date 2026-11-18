import { useEffect, useState } from 'react';
import { Bell, BellOff, Globe, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import {
  disableWebPush,
  enableWebPush,
  getWebPushStatus,
  sendLocalTestNotification,
  type PushStatus,
} from '../../services/webPush';
import { ModalDialog } from '../ui/ModalDialog';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { t } = useTranslation();
  const { backendMode, currentUser, currentRole, language, setLanguage, signOut } =
    useHarvestFlow();

  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open || currentRole === 'viewer') return;
    setPushError(null);
    setPushNotice(null);
    void getWebPushStatus().then(setPushStatus);
  }, [open, currentRole]);

  const handleEnablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    setPushNotice(null);
    try {
      const res = await enableWebPush(backendMode);
      if (!res.ok && res.error) setPushError(res.error);
      setPushStatus(await getWebPushStatus());
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    setPushNotice(null);
    try {
      await disableWebPush(backendMode);
      setPushStatus(await getWebPushStatus());
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    setPushError(null);
    setPushNotice(null);
    const res = await sendLocalTestNotification(
      t('notifications.pushTestTitle'),
      t('notifications.pushTestBody'),
    );
    if (res.ok) {
      setPushNotice(t('notifications.pushTestSentHint'));
    } else if (res.error) {
      setPushError(res.error);
    }
  };

  const handleLogout = () => {
    onClose();
    signOut();
  };

  const isPushReady =
    pushStatus?.permission === 'granted' && (pushStatus.subscribed || !pushStatus.vapidConfigured);

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={t('auth.profileTitle')}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-5">
        {/* Identity */}
        <div className="flex items-center gap-3.5 rounded-2xl bg-[#f6f9f6] p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1b5e20] text-sm font-bold text-white">
            {currentUser.initials}
          </div>
          <div>
            <div className="text-base font-bold text-[#1a241e]">{currentUser.name}</div>
            <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[#1b5e20]">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t(`roles.${currentRole}`)}
            </div>
          </div>
        </div>

        {/* Authorized scope */}
        <div className="rounded-xl border border-emerald-900/10 p-3.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5a6b60]">
            {t('auth.authorizedDept')}
          </div>
          <p className="mt-1 text-sm text-[#435349]">{t(`roleDescriptions.${currentRole}`)}</p>
        </div>

        {/* Preferred language */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[#1a241e]">
            <Globe className="h-4 w-4 text-[#1b5e20]" />
            {t('auth.preferredLanguage')}
          </div>
          <p className="text-xs text-[#5a6b60]">{t('auth.preferredLanguageHint')}</p>
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setLanguage('fr')}
              className={`min-h-11 rounded-xl border text-sm font-semibold transition ${
                language === 'fr'
                  ? 'border-[#1b5e20] bg-emerald-50 text-[#1b5e20] ring-2 ring-emerald-700/20'
                  : 'border-emerald-900/12 bg-white text-[#435349] hover:bg-[#f6f9f6]'
              }`}
            >
              Français (FR)
            </button>
            <button
              type="button"
              onClick={() => setLanguage('es')}
              className={`min-h-11 rounded-xl border text-sm font-semibold transition ${
                language === 'es'
                  ? 'border-[#1b5e20] bg-emerald-50 text-[#1b5e20] ring-2 ring-emerald-700/20'
                  : 'border-emerald-900/12 bg-white text-[#435349] hover:bg-[#f6f9f6]'
              }`}
            >
              Español (ES)
            </button>
          </div>
        </div>

        {/* Web Push Notifications (operational & admin roles) */}
        {currentRole !== 'viewer' && pushStatus && (
          <div className="space-y-2.5 rounded-xl border border-emerald-900/10 bg-[#fafcfa] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-[#1a241e]">
                <Bell className="h-4 w-4 text-[#1b5e20]" />
                {t('notifications.pushTitle')}
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  isPushReady
                    ? 'bg-emerald-100 text-emerald-900'
                    : pushStatus.permission === 'denied'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {isPushReady
                  ? t('notifications.pushActive')
                  : pushStatus.permission === 'denied'
                    ? t('notifications.pushBlocked')
                    : t('notifications.pushInactive')}
              </span>
            </div>

            <p className="text-xs text-[#5a6b60]">{t('notifications.pushSubtitle')}</p>

            {pushStatus.isIosSafariWithoutPwa ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                {t('notifications.pushIosHint')}
              </p>
            ) : !pushStatus.supported ? (
              <p className="text-xs text-[#5a6b60]">{t('notifications.pushNotSupported')}</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {!isPushReady ? (
                  <>
                    <button
                      type="button"
                      disabled={pushBusy || pushStatus.permission === 'denied'}
                      onClick={handleEnablePush}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#1b5e20] px-4 text-xs font-semibold text-white transition hover:bg-[#144718] disabled:opacity-50"
                    >
                      {pushBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Bell className="h-3.5 w-3.5" />
                      )}
                      {t('notifications.pushEnable')}
                    </button>
                    {pushStatus.permission === 'granted' && (
                      <button
                        type="button"
                        onClick={handleTestPush}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-900/15 bg-white px-3.5 text-xs font-semibold text-[#1b5e20] hover:bg-emerald-50"
                      >
                        {t('notifications.pushTest')}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleTestPush}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-900/15 bg-white px-3.5 text-xs font-semibold text-[#1b5e20] hover:bg-emerald-50"
                    >
                      {t('notifications.pushTest')}
                    </button>
                    {pushStatus.subscribed && (
                      <button
                        type="button"
                        disabled={pushBusy}
                        onClick={handleDisablePush}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-900/12 bg-white px-3.5 text-xs font-semibold text-[#5a6b60] hover:bg-gray-50"
                      >
                        <BellOff className="h-3.5 w-3.5" />
                        {t('notifications.pushDisable')}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {pushNotice && <p className="text-xs font-medium text-[#1b5e20]">{pushNotice}</p>}
            {pushError && <p className="text-xs font-medium text-red-600">{pushError}</p>}
          </div>
        )}

        {/* Logout */}
        <div className="border-t border-emerald-900/8 pt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/70 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100"
          >
            <LogOut className="h-4 w-4" />
            {t('auth.logout')}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
