import type { UserRole } from '../types/domain';

export type Permission =
  | 'order.create'
  | 'harvest.allocate'
  | 'harvest.start'
  | 'harvest.update_progress'
  | 'harvest.trigger_reminders'
  | 'transport.confirm_pickup'
  | 'warehouse.confirm_received'
  | 'admin.manage_farms'
  | 'admin.manage_settings'
  | 'admin.manage_users'
  | 'admin.switch_departments';

export type DepartmentKey = 'commercial' | 'farm_coordinator' | 'transport' | 'warehouse';

export type NavTabId =
  | 'dashboard'
  | 'workspace'
  | 'departments'
  | 'management'
  | 'notifications'
  | 'history';

/**
 * Frontend permission matrix simulating backend authorization.
 * In Phase 3, these exact rules are enforced server-side via Supabase Auth + PostgreSQL RLS.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: [
    'order.create',
    'harvest.allocate',
    'harvest.start',
    'harvest.update_progress',
    'harvest.trigger_reminders',
    'transport.confirm_pickup',
    'warehouse.confirm_received',
    'admin.manage_farms',
    'admin.manage_settings',
    'admin.manage_users',
    'admin.switch_departments',
  ],
  commercial: ['order.create'],
  farm_coordinator: [
    'harvest.allocate',
    'harvest.start',
    'harvest.update_progress',
    'harvest.trigger_reminders',
  ],
  transport: ['transport.confirm_pickup'],
  warehouse: ['warehouse.confirm_received'],
  viewer: [],
};

export function canPerform(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface RoleNavItem {
  id: NavTabId;
  labelKey: string;
}

export function getRoleNavItems(role: UserRole): RoleNavItem[] {
  switch (role) {
    case 'commercial':
      return [
        { id: 'dashboard', labelKey: 'nav.dashboard' },
        { id: 'workspace', labelKey: 'nav.orders' },
        { id: 'notifications', labelKey: 'nav.notifications' },
        { id: 'history', labelKey: 'nav.history' },
      ];
    case 'farm_coordinator':
      return [
        { id: 'dashboard', labelKey: 'nav.dashboard' },
        { id: 'workspace', labelKey: 'nav.harvests' },
        { id: 'notifications', labelKey: 'nav.notifications' },
        { id: 'history', labelKey: 'nav.history' },
      ];
    case 'transport':
      return [
        { id: 'dashboard', labelKey: 'nav.dashboard' },
        { id: 'workspace', labelKey: 'nav.transportQueue' },
        { id: 'notifications', labelKey: 'nav.notifications' },
        { id: 'history', labelKey: 'nav.history' },
      ];
    case 'warehouse':
      return [
        { id: 'dashboard', labelKey: 'nav.dashboard' },
        { id: 'workspace', labelKey: 'nav.warehouseQueue' },
        { id: 'notifications', labelKey: 'nav.notifications' },
        { id: 'history', labelKey: 'nav.history' },
      ];
    case 'viewer':
      return [
        { id: 'dashboard', labelKey: 'nav.dashboard' },
        { id: 'workspace', labelKey: 'nav.processTracking' },
        { id: 'history', labelKey: 'nav.history' },
      ];
    case 'admin':
      return [
        { id: 'dashboard', labelKey: 'nav.dashboard' },
        { id: 'departments', labelKey: 'nav.departments' },
        { id: 'management', labelKey: 'nav.management' },
        { id: 'notifications', labelKey: 'nav.notifications' },
        { id: 'history', labelKey: 'nav.history' },
      ];
  }
}
