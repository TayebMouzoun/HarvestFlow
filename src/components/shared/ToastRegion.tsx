import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';

export function ToastRegion() {
  const { t } = useTranslation();
  const { toasts, dismissToast } = useHarvestFlow();

  return (
    <div
      role="region"
      aria-label={t('notifications.title')}
      aria-live="polite"
      className="pointer-events-none fixed bottom-20 right-4 z-40 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:bottom-6"
    >
      {toasts.map((toast) => {
        const toneStyles =
          toast.tone === 'urgent'
            ? 'border-red-300 bg-red-600 text-white'
            : toast.tone === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-950'
              : toast.tone === 'info'
                ? 'border-emerald-200 bg-white text-[#1a241e]'
                : 'border-emerald-200 bg-[#1b5e20] text-white';

        const Icon =
          toast.tone === 'urgent' || toast.tone === 'warning'
            ? AlertTriangle
            : toast.tone === 'info'
              ? Info
              : CheckCircle2;

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${toneStyles}`}
          >
            <div className="flex items-center gap-2.5">
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{toast.text}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label={t('common.close')}
              className="rounded-lg p-1 opacity-80 transition hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
