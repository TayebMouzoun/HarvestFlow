import React, { useState } from 'react';
import {
  Bell,
  Building2,
  ClipboardList,
  Eye,
  FlaskConical,
  History,
  LayoutDashboard,
  Leaf,
  PackageCheck,
  RotateCcw,
  Settings2,
  Sprout,
  Truck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getRoleNavItems, type NavTabId } from '../../auth/permissions';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import type { UserRole } from '../../types/domain';
import { NotificationsDrawer } from '../shared/NotificationsDrawer';
import { HarvestReminderPopup } from '../shared/HarvestReminderPopup';
import { ProfileModal } from '../shared/ProfileModal';
import { ToastRegion } from '../shared/ToastRegion';
import { ConfirmModal } from '../ui/ConfirmModal';

const DEMO_ROLES: UserRole[] = [
  'commercial',
  'farm_coordinator',
  'transport',
  'warehouse',
  'viewer',
  'admin',
];

function getNavIcon(tabId: NavTabId, role: UserRole) {
  switch (tabId) {
    case 'dashboard':
      return LayoutDashboard;
    case 'departments':
      return Building2;
    case 'management':
      return Settings2;
    case 'notifications':
      return Bell;
    case 'history':
      return History;
    case 'workspace':
      if (role === 'farm_coordinator') return Sprout;
      if (role === 'transport') return Truck;
      if (role === 'warehouse') return PackageCheck;
      if (role === 'viewer') return Eye;
      return ClipboardList;
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const {
    backendMode,
    state,
    currentRole,
    currentUser,
    language,
    activeTab,
    setActiveTab,
    switchDemoRole,
    setLanguage,
    resetDemoData,
  } = useHarvestFlow();

  const isDemoMode = backendMode === 'demo';
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [showDemoBar, setShowDemoBar] = useState(true);

  const navItems = getRoleNavItems(currentRole);

  const unreadByRole = (role: UserRole) =>
    state.notifications.filter((n) => n.targetRole === role && !n.isRead).length;

  const currentUnread =
    currentRole === 'admin'
      ? state.notifications.filter((n) => !n.isRead).length
      : unreadByRole(currentRole);

  return (
    <div className="min-h-dvh bg-[#f6f9f6] pb-24 lg:pb-10">
      {/* Clearly separated Development / Demo Role Switcher Strip (Demo mode ONLY) */}
      {isDemoMode && showDemoBar && (
        <div
          role="region"
          aria-label={t('app.demoRoleLabel')}
          className="border-b border-amber-200/80 bg-amber-50/90 text-amber-950"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-200/70 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-950">
                <FlaskConical className="h-3.5 w-3.5" />
                {t('app.demoBannerBadge')}
              </span>
              <span className="hidden text-xs font-medium text-amber-900 sm:inline">
                {t('app.demoBannerHint')}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {DEMO_ROLES.map((role) => {
                  const active = currentRole === role;
                  const count = unreadByRole(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => switchDemoRole(role)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        active
                          ? 'bg-amber-900 text-white shadow-2xs'
                          : 'bg-white/80 text-amber-950 ring-1 ring-amber-900/15 hover:bg-white'
                      }`}
                    >
                      <span>{t(`rolesShort.${role}`)}</span>
                      {count > 0 && (
                        <span
                          className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                            active ? 'bg-amber-200 text-amber-950' : 'bg-red-600 text-white'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                title={t('app.resetDemo')}
                className="inline-flex items-center gap-1 rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-amber-950 ring-1 ring-amber-900/15 hover:bg-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('app.resetDemo')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDemoBar(false)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200/50"
              >
                {t('app.demoBannerHide')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real Application Header */}
      <header className="sticky top-0 z-30 border-b border-emerald-900/10 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Brand + Authorized Role Label */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1b5e20] text-white shadow-2xs transition hover:bg-[#144718]"
              aria-label={t('nav.dashboard')}
            >
              <Leaf className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-[#1a241e]">
                  {t('app.name')}
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#1b5e20] ring-1 ring-emerald-700/15">
                  {t(`roles.${currentRole}`)}
                </span>
              </div>
              <p className="hidden text-xs text-[#5a6b60] sm:block">{t('app.tagline')}</p>
            </div>
          </div>

          {/* Right Controls: Language, Notifications, Profile, optional Demo restore */}
          <div className="flex items-center gap-2">
            {isDemoMode && !showDemoBar && (
              <button
                type="button"
                onClick={() => setShowDemoBar(true)}
                className="inline-flex h-10 items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('app.demoBannerShow')}</span>
              </button>
            )}

            {/* Saved Language Toggle */}
            <div
              role="group"
              aria-label={t('app.language')}
              className="inline-flex rounded-xl border border-emerald-900/12 bg-[#f6f9f6] p-0.5"
            >
              {(['fr', 'es'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase transition ${
                    language === lang
                      ? 'bg-[#1b5e20] text-white shadow-2xs'
                      : 'text-[#5a6b60] hover:text-[#1a241e]'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            {/* Quick Notification Drawer Trigger (hidden for read-only viewer) */}
            {currentRole !== 'viewer' && (
              <button
                type="button"
                onClick={() => setNotifDrawerOpen(true)}
                aria-label={t('notifications.title')}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-900/12 bg-white text-[#1a241e] transition hover:bg-emerald-50"
              >
                <Bell className="h-5 w-5" />
                {currentUnread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white shadow-xs">
                    {currentUnread}
                  </span>
                )}
              </button>
            )}

            {/* Profile Area Button */}
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              aria-label={t('nav.profile')}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-900/12 bg-white pl-1.5 pr-3 text-xs font-semibold text-[#1a241e] transition hover:bg-emerald-50"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-[#1b5e20]">
                {currentUser.initials}
              </span>
              <span className="hidden sm:inline">{currentUser.name}</span>
            </button>
          </div>
        </div>

        {/* Desktop Role-Scoped Navigation Bar (Strictly Authorized Tabs Only) */}
        <div className="hidden border-t border-emerald-900/8 bg-[#fafcfa] lg:block">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2">
            <nav aria-label={t(`roles.${currentRole}`)} className="flex items-center gap-1.5">
              {navItems.map((item) => {
                const Icon = getNavIcon(item.id, currentRole);
                const active = activeTab === item.id;
                const showUnreadBadge = item.id === 'notifications' && currentUnread > 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
                      active
                        ? 'bg-[#1b5e20] text-white shadow-xs'
                        : 'text-[#435349] hover:bg-emerald-50 hover:text-[#1b5e20]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{t(item.labelKey)}</span>
                    {showUnreadBadge && (
                      <span
                        className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                          active ? 'bg-white text-[#1b5e20]' : 'bg-red-600 text-white'
                        }`}
                      >
                        {currentUnread}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      {/* Mobile Bottom Role-Scoped Navigation Bar (Strictly Authorized Tabs Only) */}
      <nav
        aria-label={t(`roles.${currentRole}`)}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-emerald-900/10 bg-white/95 px-1.5 py-1.5 backdrop-blur-sm lg:hidden"
      >
        <div
          className={`mx-auto grid max-w-lg gap-1 ${
            navItems.length === 5
              ? 'grid-cols-5'
              : navItems.length === 3
                ? 'grid-cols-3'
                : 'grid-cols-4'
          }`}
        >
          {navItems.map((item) => {
            const Icon = getNavIcon(item.id, currentRole);
            const active = activeTab === item.id;
            const showUnreadBadge = item.id === 'notifications' && currentUnread > 0;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition ${
                  active
                    ? 'bg-emerald-50 text-[#1b5e20]'
                    : 'text-[#5a6b60] hover:bg-[#f6f9f6]'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
                {showUnreadBadge && (
                  <span className="absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                    {currentUnread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <NotificationsDrawer open={notifDrawerOpen} onClose={() => setNotifDrawerOpen(false)} />
      <HarvestReminderPopup />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />

      <ConfirmModal
        open={resetConfirmOpen}
        title={t('app.resetConfirmTitle')}
        body={t('app.resetConfirmBody')}
        tone="danger"
        onConfirm={() => {
          resetDemoData();
          setResetConfirmOpen(false);
        }}
        onCancel={() => setResetConfirmOpen(false)}
      />

      <ToastRegion />
    </div>
  );
}
