import {
  ArrowRight,
  ClipboardList,
  Eye,
  Leaf,
  PackageCheck,
  ShieldCheck,
  Sprout,
  Truck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import type { UserRole } from '../../types/domain';

const ROLE_ICONS: Record<UserRole, React.ComponentType<{ className?: string }>> = {
  commercial: ClipboardList,
  farm_coordinator: Sprout,
  transport: Truck,
  warehouse: PackageCheck,
  viewer: Eye,
  admin: ShieldCheck,
};

export function DemoLoginView() {
  const { t } = useTranslation();
  const { state, language, setLanguage, signInAsUser, getUserSavedLanguage } = useHarvestFlow();

  const activeUsers = state.users.filter((u) => u.isActive);

  return (
    <div className="flex min-h-dvh flex-col bg-[#f6f9f6]">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1b5e20] text-white shadow-xs">
            <Leaf className="h-5 w-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-[#1a241e]">
              {t('app.name')}
            </span>
            <p className="text-xs text-[#5a6b60]">{t('app.tagline')}</p>
          </div>
        </div>

        <div
          role="group"
          aria-label={t('app.language')}
          className="inline-flex rounded-xl border border-emerald-900/12 bg-white p-0.5 shadow-2xs"
        >
          {(['fr', 'es'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLanguage(lang)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase transition ${
                language === lang
                  ? 'bg-[#1b5e20] text-white'
                  : 'text-[#5a6b60] hover:text-[#1a241e]'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 pb-12 pt-4 sm:px-6">
        <div className="rounded-3xl border border-emerald-900/10 bg-white p-6 shadow-sm sm:p-8">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-600/20">
            {t('app.demoBannerBadge')}
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#1a241e]">
            {t('auth.loginTitle')}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[#5a6b60]">
            {t('auth.loginSubtitle')}
          </p>

          <div className="mt-6 grid gap-3">
            {activeUsers.map((user) => {
              const Icon = ROLE_ICONS[user.role];
              const savedLang = getUserSavedLanguage(user);
              const isAdmin = user.role === 'admin';

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => signInAsUser(user.id)}
                  className={`group flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition hover:shadow-xs ${
                    isAdmin
                      ? 'border-emerald-800/25 bg-emerald-50/40 hover:border-[#1b5e20]'
                      : 'border-emerald-900/10 bg-[#fafcfa] hover:border-[#1b5e20]/50 hover:bg-emerald-50/30'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        isAdmin
                          ? 'bg-[#1b5e20] text-white'
                          : 'bg-emerald-100/80 text-[#1b5e20]'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[#1a241e]">{user.name}</span>
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-[#1b5e20] ring-1 ring-emerald-900/10">
                          {t(`roles.${user.role}`)}
                        </span>
                        <span className="rounded-md bg-emerald-950/6 px-1.5 py-0.5 text-[11px] font-bold uppercase text-[#5a6b60]">
                          {savedLang}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[#5a6b60]">
                        {t(`roleDescriptions.${user.role}`)}
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#1b5e20] ring-1 ring-emerald-900/10 transition group-hover:bg-[#1b5e20] group-hover:text-white">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-6 rounded-xl bg-[#f6f9f6] px-4 py-3 text-xs text-[#5a6b60]">
            {t('auth.demoNotice')}
          </p>
        </div>
      </main>
    </div>
  );
}
