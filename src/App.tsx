import React from 'react';
import { Leaf } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HarvestFlowProvider, useHarvestFlow } from './context/HarvestFlowContext';
import { AppShell } from './components/layout/AppShell';
import { DemoLoginView } from './features/auth/DemoLoginView';
import { SupabaseLoginView } from './features/auth/SupabaseLoginView';
import { RoleDashboardView } from './features/dashboards/RoleDashboardView';
import { CommercialView } from './features/commercial/CommercialView';
import { FarmCoordinatorView } from './features/harvest/FarmCoordinatorView';
import { TransportView } from './features/transport/TransportView';
import { WarehouseView } from './features/warehouse/WarehouseView';
import { ViewerView } from './features/viewer/ViewerView';
import { AdminView } from './features/admin/AdminView';
import { NotificationsPage } from './components/shared/NotificationsPage';
import { HistoryPage } from './components/shared/HistoryPage';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Unexpected error' };
  }

  handleReset = () => {
    try {
      localStorage.removeItem('harvestflow_v1_prototype_state');
      localStorage.removeItem('harvestflow_v1_demo_session');
      localStorage.removeItem('harvestflow_v1_user_languages');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-[#f6f9f6] p-6">
          <div className="max-w-md rounded-2xl border border-emerald-900/10 bg-white p-6 text-center shadow-sm">
            <h1 className="text-lg font-bold text-[#1a241e]">HarvestFlow</h1>
            <p className="mt-2 text-sm text-[#5a6b60]">{this.state.message}</p>
            <button
              type="button"
              onClick={this.handleReset}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1b5e20] px-5 text-sm font-semibold text-white hover:bg-[#144718]"
            >
              Reset &amp; Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthorizedContent() {
  const { currentRole, activeTab } = useHarvestFlow();

  if (activeTab === 'notifications' && currentRole !== 'viewer') {
    return <NotificationsPage />;
  }

  if (activeTab === 'history') {
    return <HistoryPage />;
  }

  // Administrator exclusive views
  if (currentRole === 'admin') {
    if (activeTab === 'departments') return <AdminView mode="departments" />;
    if (activeTab === 'management') return <AdminView mode="management" />;
    return <AdminView mode="dashboard" />;
  }

  // Read-only Viewer dedicated views
  if (currentRole === 'viewer') {
    return <ViewerView mode={activeTab === 'workspace' ? 'workspace' : 'dashboard'} />;
  }

  // Operational department dashboards vs. workspaces
  if (activeTab === 'dashboard') {
    return <RoleDashboardView />;
  }

  switch (currentRole) {
    case 'commercial':
      return <CommercialView />;
    case 'farm_coordinator':
      return <FarmCoordinatorView />;
    case 'transport':
      return <TransportView />;
    case 'warehouse':
      return <WarehouseView />;
  }
}

function AppRouter() {
  const { t } = useTranslation();
  const { backendMode, authLoading, isAuthenticated } = useHarvestFlow();

  if (authLoading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#f6f9f6] p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1b5e20] text-white shadow-sm">
          <Leaf className="h-6 w-6 animate-pulse" />
        </div>
        <p className="text-sm font-medium text-[#5a6b60]">{t('auth.loadingWorkspace')}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return backendMode === 'supabase' ? <SupabaseLoginView /> : <DemoLoginView />;
  }

  return (
    <AppShell>
      <AuthorizedContent />
    </AppShell>
  );
}

export function App() {
  return (
    <AppErrorBoundary>
      <HarvestFlowProvider>
        <AppRouter />
      </HarvestFlowProvider>
    </AppErrorBoundary>
  );
}

export default App;
