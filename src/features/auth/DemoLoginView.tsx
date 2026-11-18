import {
  ArrowRight,
  ClipboardList,
  Eye,
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
  const { state, signInAsUser, getUserSavedLanguage } = useHarvestFlow();

  const activeUsers = state.users.filter((u) => u.isActive);

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-gradient-to-b from-[#eaf3ec] via-[#f5f8f5] to-[#ebf3ed] px-4 py-8 sm:px-6">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-xl">
          {/* Main Card */}
          <div className="rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-2xl shadow-emerald-950/6 backdrop-blur-sm sm:p-9">
            {/* Header Brand */}
            <div className="flex flex-col items-center text-center">
              <img
                src="/company-logo.png"
                alt="Nature Growers"
                className="h-12 w-auto object-contain sm:h-14"
              />
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-600/20">
                <span className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-500/20" />
                <span>{t('app.demoBannerBadge')}</span>
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#1a241e] sm:text-[26px]">
                {t('auth.loginTitle')}
              </h1>
              <p className="mt-1.5 text-xs leading-relaxed text-[#5a6b60] sm:text-sm">
                {t('auth.loginSubtitle')}
              </p>
            </div>

            {/* Employee accounts list */}
            <div className="mt-6 grid gap-2.5 sm:gap-3">
              {activeUsers.map((user) => {
                const Icon = ROLE_ICONS[user.role];
                const savedLang = getUserSavedLanguage(user);
                const isAdmin = user.role === 'admin';

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => signInAsUser(user.id)}
                    className={`group flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition hover:shadow-sm sm:p-4 ${
                      isAdmin
                        ? 'border-emerald-800/25 bg-emerald-50/40 hover:border-[#1b5e20] hover:bg-emerald-50/70'
                        : 'border-emerald-900/10 bg-[#fafcfa] hover:border-[#1b5e20]/50 hover:bg-emerald-50/30'
                    }`}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                          isAdmin
                            ? 'bg-[#1b5e20] text-white shadow-xs'
                            : 'bg-emerald-100/80 text-[#1b5e20]'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="truncate text-sm font-bold text-[#1a241e]">
                            {user.name}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[#1b5e20] ring-1 ring-emerald-900/10">
                            {t(`roles.${user.role}`)}
                          </span>
                          <span className="rounded-md bg-emerald-950/6 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#5a6b60]">
                            {savedLang}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-[#5a6b60]">
                          {t(`roleDescriptions.${user.role}`)}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#1b5e20] ring-1 ring-emerald-900/10 transition group-hover:bg-[#1b5e20] group-hover:text-white">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mt-6 rounded-xl bg-[#f6f9f6] px-4 py-3 text-xs leading-relaxed text-[#5a6b60]">
              {t('auth.demoNotice')}
            </p>
          </div>
        </div>
      </div>

      {/* Page bottom copyright */}
      <footer className="py-3 text-center text-xs text-[#5a6b60]/75">
        &copy; {new Date().getFullYear()} Nature Growers · {t('auth.allRightsReserved')}
      </footer>
    </div>
  );
}
