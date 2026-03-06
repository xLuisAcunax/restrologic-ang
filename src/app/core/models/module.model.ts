export type ModuleStatus =
  | 'draft'
  | 'beta'
  | 'active'
  | 'deprecated'
  | 'retired';

export type ModuleScope = 'TENANT' | 'BRANCH';

export interface ModuleManifest {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  status: ModuleStatus;
  category?: string | null;
  defaultConfig?: any;
  configSchema?: any;
  docsUrl?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CreateModuleDto {
  key: string;
  name: string;
  description?: string | null;
  status?: ModuleStatus;
  category?: string | null;
  defaultConfig?: any;
  configSchema?: any;
  docsUrl?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface UpdateModuleDto {
  name?: string;
  description?: string | null;
  status?: ModuleStatus;
  category?: string | null;
  defaultConfig?: any;
  configSchema?: any;
  docsUrl?: string;
  updatedBy?: string;
}

export interface ModuleAssignment {
  id: string;
  moduleKey: string;
  tenantId: string;
  branchId?: string | null;
  scope: ModuleScope;
  isEnabled: boolean;
  config?: any;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignModuleDto {
  tenantId: string;
  branchId?: string | null;
  moduleKey: string;
  scope: ModuleScope;
  isEnabled?: boolean;
  config?: any;
  createdBy?: string;
  updatedBy?: string;
}

export interface UpdateModuleAssignmentDto {
  isEnabled?: boolean;
  config?: any;
  updatedBy?: string;
}

/**
 * Interface for effective modules returned by /modules/effective endpoint
 * Used for frontend feature gating
 */
export interface EffectiveModule {
  moduleKey: string;
  name: string;
  description: string | null;
  enabled: boolean;
  source: 'BRANCH' | 'TENANT';
  config: any;
}

// ================= DELIVERIES MODULE CONFIG (Phase A) =================
// Strongly typed configuration for the 'deliveries' module. The backend still
// returns a generic JSON payload; we cast it using getModuleConfig<DeliveriesModuleConfig>('deliveries').

export type DeliveryAutoAssignmentStrategy =
  | 'MANUAL'
  | 'ROUND_ROBIN'
  | 'NEAREST';

export type DeliveryRouteProvider = 'NONE' | 'MAPBOX' | 'GOOGLE';

export interface DeliveriesPricingBracket {
  /** Distance upper bound for this bracket (inclusive) */
  upToKm: number;
  /** Flat fee applied if perKm is not provided */
  baseFee: number;
  /** Optional per-km fee applied for the portion inside this bracket */
  perKm?: number;
}

export interface DeliveriesModuleConfig {
  /** Enables public ordering menu (Phase A gating) */
  enablePublicMenu: boolean;
  /** Maximum allowed delivery radius in kilometers */
  deliveryRadiusKm: number;
  /** Distance-based pricing brackets (sorted ascending by upToKm) */
  pricingBrackets: DeliveriesPricingBracket[];
  /** Strategy used when auto-assignment is activated (Phase B for non-manual) */
  autoAssignmentStrategy: DeliveryAutoAssignmentStrategy;
  /** External route provider for ETA/distance enrichment (Phase B/C) */
  routeProvider: DeliveryRouteProvider;
  /** Optional free delivery threshold (null => disabled) */
  freeDeliveryThresholdKm?: number | null;
}

// Recommended default config (documentation / seeding helper)
export const DEFAULT_DELIVERIES_MODULE_CONFIG: DeliveriesModuleConfig = {
  enablePublicMenu: false,
  deliveryRadiusKm: 10,
  pricingBrackets: [
    { upToKm: 3, baseFee: 0 }, // Often free for nearby
    { upToKm: 7, baseFee: 3000 },
    { upToKm: 10, baseFee: 5000 },
  ],
  autoAssignmentStrategy: 'MANUAL',
  routeProvider: 'NONE',
  freeDeliveryThresholdKm: 3,
};
