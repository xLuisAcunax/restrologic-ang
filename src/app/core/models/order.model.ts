import { AppliedTax } from '../../shared/utils/tax.utils';
import { AssignedUser } from './user.model';

// Modifier selection types
export type ModifierSelection = {
  modifierId: string;
  modifierName: string;
  quantity?: number; // For modifiers that allow quantity (e.g., extra cheese x2)
};

export type ModifierGroupSelection = {
  groupId: string;
  groupName: string;
  selectionType: 'SINGLE' | 'MULTIPLE'; // single choice or multiple
  modifiers: ModifierSelection[];
};

// Order item with modifier support
export type OrderItemModifier = {
  groupId: string;
  groupName: string;
  modifierId: string;
  modifierName: string;
  quantity?: number;
  additionalPrice?: number; // Extra cost for this modifier
  portion?: number;
};

export type OrderItemModifierSnapshot = {
  modifierGroupId: string;
  modifierId: string;
  name: string;
  price: number;
  portion: number;
};

export type CreateTaxDto = {
  type: 'percentage' | 'fixed';
  value: number;
  reason?: string | null;
  isIncluded?: boolean; // true = incluido en el precio, false = se suma al total
};

export type CreateDiscountDto = {
  type: 'percentage' | 'fixed';
  value: number;
  reason?: string | null;
};

export type OrderDiscountDto = {
  type: 'percentage' | 'fixed';
  value: number;
  reason?: string | null;
};

export type OrderItemStatusType =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled';

export type OrderItemStatusDto = {
  type: OrderItemStatusType;
};

export type PaymentMethodType =
  | 'cash'
  | 'card'
  | 'debit'
  | 'credit'
  | 'bank_transfer'
  | 'mobile'
  | 'nequi'
  | 'daviplata'
  | 'other';

export type PaymentDto = {
  method: PaymentMethodType;
  amount: number;
  paidAt: string;
  paidBy: string;
  status?: 'pending' | 'confirmed' | 'voided';
  reference?: string | null;
  notes?: string | null;
  receivedAmount?: number | null;
  changeGiven?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type RegisterPaymentDto = {
  method: PaymentMethodType;
  amount: number;
  paidAt?: string;
  paidBy?: string;
  reference?: string | null;
  notes?: string | null;
  status?: 'pending' | 'confirmed' | 'voided';
  closeOrder?: boolean;
};

export type OrderStatusHistoryDto = {
  status: { type: OrderStatus | string } | OrderStatus | string;
  changedAt?: string;
  changedBy: string | Record<string, unknown>;
};

export type OrderItem = {
  id?: string;
  productId: string;
  productName: string;
  quantity?: number; // Quantity of this item
  unitPrice: number;
  sizeId?: string; // optional: tamaño seleccionado (pizzas)
  variantId?: string; // alternative name for productVariantId
  productVariantId?: string;
  sizeName?: string; // Display name for size
  variantName?: string; // Display name for variant
  modifiers?: OrderItemModifier[]; // Selected modifiers for this item
  subtotal: number; // unitPrice + modifier costs × quantity
  notes?: string;
  status?: OrderStatus | string;
  servedAt?: string;
  isServed?: boolean;
  taxes?: CreateTaxDto[];
  discounts?: CreateDiscountDto[];
  lineDiscount?: number; // field from some API responses
  lineTotal?: number; // field from some API responses
};

// Order types
export type OrderStatus =
  | 'DRAFT'
  | 'draft'
  | 'SUBMITTED'
  | 'submitted'
  | 'PARTIALLYPAID'
  | 'partiallypaid'
  | 'INPREPARATION'
  | 'inpreparation'
  | 'CREATED'
  | 'created'
  | 'PENDING'
  | 'pending'
  | 'CONFIRMED'
  | 'confirmed'
  | 'PREPARING'
  | 'preparing'
  | 'READY'
  | 'ready'
  | 'SERVED'
  | 'served'
  | 'PAID'
  | 'paid'
  | 'CLOSED'
  | 'closed'
  | 'CANCELLED'
  | 'cancelled';

export type Order = {
  id: string;
  code?: string | number; // Número/código de orden secuencial
  tenantId?: string;
  branchId: string;
  tableId: string;
  tableName?: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax?: number;
  taxTotal?: number;
  total: number;
  createdBy?: string; // Waiter ID
  createdAt: string;
  submittedAt?: string;
  paidAt?: string;
  closedAt?: string;
  guests?: number | null;
  updatedAt?: string;
  taxes?: CreateTaxDto[];
  discounts?: OrderDiscountDto[];
  taxesTotal?: number;
  discountsTotal?: number;
  payments?: PaymentDto[];
  statusHistory?: OrderStatusHistoryDto[];
  requiresDelivery?: boolean;
  isTakeaway?: boolean;
  source?: string; // 'public-menu', 'internal', etc.
  customer?: PublicOrderCustomerDto; // Datos del cliente para órdenes públicas
  assignedTo?: AssignedUser | null;
  assignedToUserId?: string | null;
  notes?: string | null; // Notas generales de la orden (ej: motivo de cancelación)
  /** Delivery metadata (Phase A). Null/undefined if not a delivery order */
  delivery?: DeliveryInfo | null;
};

// DTOs
export type OrderItemDto = {
  id?: string;
  productId: string;
  qty: number;
  unitPrice?: number; // Precio unitario del producto (sin modifiers)
  sizeId?: string; // Tamaño seleccionado para pizzas
  modifiers: OrderItemModifierSnapshot[];
  notes?: string;
  taxes: CreateTaxDto[];
  discounts: CreateDiscountDto[];
  status: OrderItemStatusDto;
  subtotal: number;
};

// Public tracking payload for read-only customer tracking
export type PublicOrderTracking = {
  code?: number;
  status: OrderStatus | { type: OrderStatus } | string;
  statusHistory?: OrderStatusHistoryDto[];
  customer?: any;
  requiresDelivery?: boolean;
  deliveryStatus?: string;
  // Backend may return either an array of events or an object with a history array.
  deliveryTracking?:
    | {
        history?: {
          status: string;
          at?: string;
          by?: string;
        }[];
      }
    | {
        status: string;
        at?: string;
        by?: string;
      }[]
    | null;
  createdAt?: string;
  total?: number;
  isActive?: boolean;
  source?: string;
};

export type PublicOrderTrackingResponse = {
  ok: boolean;
  data: PublicOrderTracking | null;
};

export type CreateOrderDto = {
  tenantId: string;
  branchId: string;
  tableId?: string | null;
  assignedTo?: string | null;
  items: OrderItemDto[];
  taxes: CreateTaxDto[];
  discounts: OrderDiscountDto[];
  status: {
    type:
      | 'created'
      | 'pending'
      | 'confirmed'
      | 'preparing'
      | 'ready'
      | 'served'
      | 'paid'
      | 'closed'
      | 'cancelled';
  };
  statusHistory: OrderStatusHistoryDto[];
  payments: PaymentDto[];
  subtotal: number;
  taxesTotal: number;
  discountsTotal: number;
  total: number;
  isTakeaway: boolean;
  createdBy: string;
};

// ===== Public Menu Order DTO (Frontend -> Backend public endpoint) =====
export type PublicOrderCustomerDto = {
  name: string;
  phone: string;
  address?: string;
  notes?: string;
};

export type CreatePublicOrderDto = {
  tenantId: string;
  branchId: string;
  source: 'public-menu';
  isTakeaway: boolean; // derived (true si no hay dirección)
  customer: PublicOrderCustomerDto;
  items: any[]; // Changed as the backend now expects OrderItemRequest structure
  delivery?: {
    requiresDelivery: boolean;
    address?: string;
    distanceKm?: number;
    fee?: number;
    status?: DeliveryStatus;
    location?: {
      lat: number;
      lng: number;
    } | null;
  };
};

export type UpdateOrderDto = {
  items?: OrderItemDto[];
  taxes?: CreateTaxDto[];
  discounts?: OrderDiscountDto[];
  status?: { type: OrderStatus } | OrderStatus;
  statusHistory?: OrderStatusHistoryDto[];
  payments?: PaymentDto[];
  subtotal?: number;
  taxesTotal?: number;
  discountsTotal?: number;
  total?: number;
  notes?: string | null; // Notas de la orden (ej: motivo de cancelación)
};

export type OrderResponse = {
  ok: boolean;
  data: Order;
};

export type OrdersResponse = {
  ok: boolean;
  data: Order[];
};

export type OrdersSinceResponse = {
  ok: boolean;
  data: Order[];
  timestamp?: string; // server-provided watermark if available
  hasMore?: boolean;
  count?: number;
};

export type DeliveryStatus =
  | 'pending'
  | 'assigned'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'failed';

export type DeliveryInfo = {
  requiresDelivery: boolean;
  address?: string;
  distanceKm?: number | null;
  fee?: number | null;
  driverId?: string | null;
  status?: DeliveryStatus;
  assignedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  failedAt?: string | null;
  eta?: number | null;
  location?: {
    lat: number;
    lng: number;
  } | null;
  routeEtaMinutes?: number | null;
  trackingId?: string | null;
  notes?: string | null;
};

export type UpdateDeliveryStatusDto = {
  status: DeliveryStatus;
  changedBy?: string;
};

export type GenericOkResponse = { ok: boolean; message?: string };

export type OrderMaybeResponse = {
  ok: boolean;
  data: Order | null;
};

export type DeliveryOrderToast = {
  id: string;
  code?: string | number;
  branchId: string;
  createdAt: string;
  customerName?: string;
  address?: string;
  message: string;
};

export type OrderDetailsDialogData = {
  tenantId: string;
  branchId: string;
  orderId: string;
  tableName?: string;
  assignedToLabel?: string;
  statusCode?: string;
  statusLabel?: string;
  taxesFallback?: AppliedTax[];
  taxesTotalFallback?: number;
  netSubtotalFallback?: number;
  totalFallback?: number;
  productNameFallbacks?: Record<string, string>;
  userNameFallbacks?: Record<string, string>;
};

