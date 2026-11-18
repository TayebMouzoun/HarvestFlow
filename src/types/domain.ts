export type UserRole =
  | 'admin'
  | 'commercial'
  | 'farm_coordinator'
  | 'transport'
  | 'warehouse'
  | 'viewer';

export type Language = 'fr' | 'es';

export type OrderPriority = 'normal' | 'urgent';

export type OrderStatus =
  | 'pending_allocation'
  | 'allocated'
  | 'in_progress'
  | 'completed';

export type HarvestStatus = 'pending' | 'in_progress' | 'completed';

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  defaultLanguage: Language;
  initials: string;
  isActive: boolean;
  passwordUpdatedAt?: string;
}

export interface Farm {
  id: string;
  name: string;
  code?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HarvestSettings {
  progressSteps: number[];
  reminderIntervalMinutes: number;
  transportPrepThresholdPct: number;
  productSuggestions: string[];
}

export interface HarvestProgressRecord {
  id: string;
  previousPct: number;
  newPct: number;
  isCorrection?: boolean;
  reason?: string;
  recordedBy: string;
  recordedAt: string;
}

export interface FarmAllocation {
  id: string;
  orderId: string;
  farmId: string;
  farmNameSnapshot: string;
  allocatedQtyKg: number;
  harvestStatus: HarvestStatus;
  currentProgressPct: number;
  harvestStartedAt?: string;
  harvestCompletedAt?: string;
  lastProgressAt?: string;
  lastReminderAt?: string;
  prepAlertSent: boolean;
  pickupDone: boolean;
  pickupDoneAt?: string;
  pickupDoneBy?: string;
  receivedDone: boolean;
  receivedDoneAt?: string;
  receivedDoneBy?: string;
  progressHistory: HarvestProgressRecord[];
}

export interface Order {
  id: string;
  reference: string;
  product: string;
  quantityKg: number;
  priority: OrderPriority;
  notes?: string;
  status: OrderStatus;
  createdBy: string;
  createdAt: string;
  allocatedAt?: string;
  harvestStartedAt?: string;
  completedAt?: string;
  allocations: FarmAllocation[];
}

export type NotificationType =
  | 'new_order'
  | 'harvest_started'
  | 'harvest_reminder'
  | 'transport_prep'
  | 'transport_prep_corrected'
  | 'harvest_ready'
  | 'pickup_done'
  | 'order_completed';

export type NotificationSeverity = 'info' | 'warning' | 'urgent' | 'success';

export interface AppNotification {
  id: string;
  targetRole: UserRole;
  type: NotificationType;
  severity: NotificationSeverity;
  titleKey: string;
  messageKey: string;
  params: Record<string, string | number>;
  orderId?: string;
  allocationId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface HistoryEvent {
  id: string;
  orderId?: string;
  orderRef?: string;
  actorName: string;
  actorRole: UserRole;
  actionKey: string;
  params: Record<string, string | number>;
  occurredAt: string;
}

export interface HarvestFlowState {
  users: DemoUser[];
  farms: Farm[];
  settings: HarvestSettings;
  orders: Order[];
  notifications: AppNotification[];
  history: HistoryEvent[];
  nextOrderNumber: number;
}
