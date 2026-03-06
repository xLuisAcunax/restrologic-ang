export interface OrderEvent {
  id: string;
  eventType:
    | 'order.created'
    | 'order.updated'
    | 'order.item_added'
    | 'order.payment_registered'
    | 'order.status_changed'
    | 'order.deleted'
    | 'table.locked'
    | 'table.released';
  orderId: string | null;
  tableId: string | null;
  tenantId: string;
  branchId: string;
  payload: Record<string, any>;
  timestamp: string;
  version: number;
  expiresAt: string;
}

export interface EventPollResponse {
  ok: boolean;
  events: OrderEvent[];
  serverTime: string;
  count: number;
  lastVersion?: number;
}

export interface EventPollingOptions {
  tableId?: string;
  orderId?: string;
  eventType?: string;
  enabled?: boolean;
  onEvent?: (event: OrderEvent) => void;
  onError?: (error: any) => void;
}
