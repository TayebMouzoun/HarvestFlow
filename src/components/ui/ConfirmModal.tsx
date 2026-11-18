import { useTranslation } from 'react-i18next';
import { ModalDialog } from './ModalDialog';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  tone?: 'primary' | 'warning' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation();

  const confirmClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : tone === 'warning'
        ? 'bg-amber-600 hover:bg-amber-700 text-white'
        : 'bg-[#1b5e20] hover:bg-[#144718] text-white';

  return (
    <ModalDialog open={open} onClose={onCancel} title={title} maxWidthClass="max-w-md">
      <p className="text-sm leading-relaxed text-[#435349]">{body}</p>
      <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button
          type="button"
          autoFocus={tone === 'danger'}
          onClick={onCancel}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-900/15 bg-white px-5 text-sm font-medium text-[#1a241e] transition hover:bg-emerald-50/60"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          autoFocus={tone !== 'danger'}
          onClick={onConfirm}
          className={`inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-semibold shadow-sm transition ${confirmClass}`}
        >
          {confirmLabel ?? t('common.confirm')}
        </button>
      </div>
    </ModalDialog>
  );
}
