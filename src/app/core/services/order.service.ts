import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import {
  CreateOrderDto,
  CreatePublicOrderDto,
  DeliveryInfo,
  DeliveryStatus,
  GenericOkResponse,
  Order,
  OrderMaybeResponse,
  OrderResponse,
  OrdersResponse,
  OrdersSinceResponse,
  OrderStatus,
  PublicOrderTrackingResponse,
  RegisterPaymentDto,
  UpdateDeliveryStatusDto,
  UpdateOrderDto,
} from '../models/order.model';

export type CreateOrderRequest = {
  branchId?: string;
  tableId?: string | null;
  guests?: number;
  notes?: string;
  assignedToUserId?: string;
};

export type UpdateOrderRequest = {
  branchId?: string;
  tableId?: string | null;
  guests?: number | null;
  notes?: string | null;
  status?: string;
};

export type OrderItemRequest = {
  productId: string;
  productVariantId?: string | null;
  sizeId?: string | null;
  quantity: number;
  unitPrice?: number;
  notes?: string | null;
  options?: { optionId: string; quantity?: number }[];
};

export type OrderItemUpdateRequest = Partial<{
  quantity: number;
  notes: string | null;
  sizeId: string | null;
  status: string;
  options: { optionId: string; quantity?: number }[];
}>;

export type OrderItem = {
  id: string;
  orderId?: string;
  productId: string;
  productVariantId?: string | null;
  quantity: number;
  notes?: string | null;
  sizeId?: string | null;
  unitPrice?: number;
  lineDiscount?: number;
  lineTotal?: number;
  productName?: string;
  variantName?: string | null;
  sizeName?: string | null;
};

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly base = environment.apiBaseUrl;
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private withTenant() {
    const tenantId = this.auth.me()?.tenantId;
    return tenantId
      ? { headers: new HttpHeaders({ 'X-Tenant-ID': tenantId }) }
      : {};
  }

  private withTenantAndParams(params?: HttpParams) {
    if (params && params.keys().length > 0) {
      return { params, ...this.withTenant() };
    }
    return this.withTenant();
  }

  private normalizeStatus(status: unknown): string {
    const raw = String(status ?? '')
      .trim()
      .toLowerCase();

    switch (raw) {
      case 'draft':
        return 'created';
      case 'submitted':
        return 'pending';
      case 'inpreparation':
        return 'preparing';
      default:
        return raw || 'created';
    }
  }

  private mapDelivery(delivery: any): DeliveryInfo | null {
    if (!delivery || typeof delivery !== 'object') {
      return null;
    }

    return {
      requiresDelivery: true,
      address: delivery.address,
      distanceKm:
        typeof delivery.distanceKm === 'number' ? delivery.distanceKm : null,
      fee: typeof delivery.fee === 'number' ? delivery.fee : null,
      status: delivery.status
        ? (String(delivery.status).toLowerCase() as DeliveryStatus)
        : undefined,
    };
  }

  private mapOrderFromApi(payload: any): Order {
    const status = this.normalizeStatus(payload?.status);
    const hasDelivery = !!payload?.delivery;
    const requiresDelivery =
      typeof payload?.requiresDelivery === 'boolean'
        ? payload.requiresDelivery
        : hasDelivery || payload?.isTakeaway === false;
    const taxTotal =
      typeof payload?.taxTotal === 'number'
        ? payload.taxTotal
        : typeof payload?.taxesTotal === 'number'
          ? payload.taxesTotal
          : 0;

    return {
      ...(payload || {}),
      code: payload?.code,
      status: status as Order['status'],
      items: Array.isArray(payload?.items) ? payload.items : [],
      subtotal: typeof payload?.subtotal === 'number' ? payload.subtotal : 0,
      tax: taxTotal,
      taxTotal,
      taxesTotal: taxTotal,
      total: typeof payload?.total === 'number' ? payload.total : 0,
      createdBy: payload?.createdBy || payload?.assignedToUserId || '',
      notes: payload?.notes ?? '',
      requiresDelivery,
      customer: payload?.customer ?? undefined,
      delivery: this.mapDelivery(payload?.delivery),
      isTakeaway: !!payload?.isTakeaway,
      source: payload?.source,
      assignedToUserId: payload?.assignedToUserId ?? null,
    } as Order;
  }

  private normalizeOpenOrdersPayload(payload: any): Order[] {
    const rows = Array.isArray(payload) ? payload : [];

    return rows.map((row: any) => {
      const orderPayload = row?.order || row?.Order || row;
      const itemsPayload = row?.items || row?.Items;

      const mapped = this.mapOrderFromApi(orderPayload);
      if (Array.isArray(itemsPayload)) {
        mapped.items = itemsPayload;
      }
      return mapped;
    });
  }

  private normalizeUpdateOrderPayload<T>(payload: T): T {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const normalized: any = { ...(payload as any) };

    if (
      normalized.status &&
      typeof normalized.status === 'object' &&
      'type' in normalized.status
    ) {
      normalized.status = String(normalized.status.type || '').trim();
    }

    if (Array.isArray(normalized.items)) {
      normalized.items = normalized.items.map((item: any) => {
        if (!item || typeof item !== 'object') {
          return item;
        }
        if (
          item.status &&
          typeof item.status === 'object' &&
          'type' in item.status
        ) {
          return { ...item, status: String(item.status.type || '').trim() };
        }
        return item;
      });
    }

    return normalized as T;
  }

  // ---------- Orders v2 (tenant header) ----------
  createOrGetOrderForTable(tableId: string, dto?: CreateOrderRequest) {
    return this.http
      .post<Order>(
        `${this.base}/tables/${tableId}/orders`,
        dto ?? {},
        this.withTenant(),
      )
      .pipe(map((order) => this.mapOrderFromApi(order)));
  }

  getOpenOrderForTable(tableId: string) {
    return this.http
      .get<Order>(
        `${this.base}/tables/${tableId}/orders/open`,
        this.withTenant(),
      )
      .pipe(map((order) => this.mapOrderFromApi(order)));
  }

  listOrders(filters?: {
    branchId?: string;
    status?: string;
    expand?: string;
    from?: string;
    to?: string;
  }) {
    let params = new HttpParams();
    if (filters?.branchId) params = params.set('branchId', filters.branchId);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.expand) params = params.set('expand', filters.expand);
    if (filters?.from) params = params.set('from', filters.from);
    if (filters?.to) params = params.set('to', filters.to);
    return this.http
      .get<any[]>(`${this.base}/orders`, this.withTenantAndParams(params))
      .pipe(
        map((orders) =>
          (orders || []).map((order) => this.mapOrderFromApi(order)),
        ),
      );
  }

  listOpenOrders(filters?: { branchId?: string; expand?: string }) {
    let params = new HttpParams();
    if (filters?.branchId) params = params.set('branchId', filters.branchId);
    if (filters?.expand) params = params.set('expand', filters.expand);
    return this.http
      .get<any>(`${this.base}/orders/open`, this.withTenantAndParams(params))
      .pipe(map((payload) => this.normalizeOpenOrdersPayload(payload)));
  }

  createOrder(dto: CreateOrderDto | CreateOrderRequest) {
    if ((dto as CreateOrderDto).tenantId) {
      const legacy = dto as CreateOrderDto;
      return this.http.post<OrderResponse>(
        `${this.base}/tenant/${legacy.tenantId}/branch/${legacy.branchId}/order`,
        legacy,
      );
    }
    return this.http
      .post<Order>(`${this.base}/orders`, dto, this.withTenant())
      .pipe(map((order) => this.mapOrderFromApi(order)));
  }

  updateOrder(orderId: string, dto: UpdateOrderRequest): Observable<Order>;
  updateOrder(
    tenantId: string,
    branchId: string,
    orderId: string,
    dto: UpdateOrderDto,
  ): Observable<OrderResponse>;
  updateOrder(
    a: string,
    b: string | UpdateOrderRequest,
    c?: string,
    d?: UpdateOrderDto,
  ): Observable<Order | OrderResponse> {
    if (typeof b === 'string' && c && d) {
      const legacyDto = this.normalizeUpdateOrderPayload(d);
      return this.http.patch<OrderResponse>(
        `${this.base}/tenant/${a}/branch/${b}/order/${c}`,
        legacyDto,
      );
    }
    const dto = this.normalizeUpdateOrderPayload(b as UpdateOrderRequest);
    return this.http
      .patch<Order>(`${this.base}/orders/${a}`, dto, this.withTenant())
      .pipe(map((order) => this.mapOrderFromApi(order)));
  }

  deleteOrder(orderId: string) {
    return this.http.delete<void>(
      `${this.base}/orders/${orderId}`,
      this.withTenant(),
    );
  }

  getOrder(orderId: string, options?: { expand?: string }): Observable<Order>;
  getOrder(
    tenantId: string,
    branchId: string,
    orderId: string,
  ): Observable<OrderResponse>;
  getOrder(
    a: string,
    b?: string | { expand?: string },
    c?: string,
  ): Observable<Order | OrderResponse> {
    if (typeof b === 'string' && c) {
      return this.http.get<OrderResponse>(
        `${this.base}/tenant/${a}/branch/${b}/order/${c}`,
      );
    }
    const options = typeof b === 'object' ? b : undefined;
    let params = new HttpParams();
    if (options?.expand) params = params.set('expand', options.expand);
    return this.http
      .get<Order>(`${this.base}/orders/${a}`, this.withTenantAndParams(params))
      .pipe(map((order) => this.mapOrderFromApi(order)));
  }

  // ---------- Order items (v2) ----------
  listOrderItems(orderId: string) {
    return this.http.get<OrderItem[]>(
      `${this.base}/orders/${orderId}/items`,
      this.withTenant(),
    );
  }

  getOrderItem(orderId: string, itemId: string) {
    return this.http.get<OrderItem>(
      `${this.base}/orders/${orderId}/items/${itemId}`,
      this.withTenant(),
    );
  }

  addOrderItem(orderId: string, dto: OrderItemRequest) {
    return this.http.post<OrderItem>(
      `${this.base}/orders/${orderId}/items`,
      dto,
      this.withTenant(),
    );
  }

  updateOrderItem(
    orderId: string,
    itemId: string,
    dto: OrderItemUpdateRequest,
  ) {
    return this.http.patch<OrderItem>(
      `${this.base}/orders/${orderId}/items/${itemId}`,
      dto,
      this.withTenant(),
    );
  }

  deleteOrderItem(orderId: string, itemId: string) {
    return this.http.delete<void>(
      `${this.base}/orders/${orderId}/items/${itemId}`,
      this.withTenant(),
    );
  }

  // ---------- Payments (v2) ----------
  /**
   * Register a payment for an order using the new v2 API.
   * POST /api/orders/{orderId}/payments
   * The order must be in "Submitted" or "PartiallyPaid" status.
   */
  createPayment(
    orderId: string,
    dto: { amount: number; method: string; reference?: string },
  ) {
    return this.http.post<any>(
      `${this.base}/orders/${orderId}/payments`,
      dto,
      this.withTenant(),
    );
  }

  /**
   * List all payments for an order.
   * GET /api/orders/{orderId}/payments
   */
  listPayments(orderId: string) {
    return this.http.get<any[]>(
      `${this.base}/orders/${orderId}/payments`,
      this.withTenant(),
    );
  }

  // ---------- Payments (legacy) ----------
  registerPayment(
    tenantId: string,
    branchId: string,
    orderId: string,
    dto: RegisterPaymentDto,
  ) {
    return this.http.post<OrderResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/order/${orderId}/payment`,
      dto,
    );
  }

  // ---------- Public / delivery legacy endpoints ----------
  createPublicOrder(dto: CreatePublicOrderDto): Observable<any> {
    return this.http.post<any>(`${this.base}/orders/public`, dto);
  }

  updatePublicDeliveryStatus(orderId: string, dto: UpdateDeliveryStatusDto) {
    return this.http.patch<GenericOkResponse>(
      `${this.base}/order/public/${orderId}/delivery-status`,
      dto,
    );
  }

  getPublicOrder(
    orderId: string,
    tenantId?: string,
    branchId?: string,
  ): Observable<OrderMaybeResponse> {
    const params: any = {};
    if (tenantId) params.tenantId = tenantId;
    if (branchId) params.branchId = branchId;
    return this.http.get<OrderMaybeResponse>(
      `${this.base}/order/public/${orderId}`,
      { params },
    );
  }

  getOrders(
    tenantId: string,
    branchId: string,
    params?: HttpParams | { [param: string]: any },
  ): Observable<OrdersResponse> {
    return this.http.get<OrdersResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/order`,
      { params },
    );
  }

  getOrdersSince(
    tenantId: string,
    branchId: string,
    since: string,
  ): Observable<OrdersSinceResponse> {
    const params = new HttpParams().set('since', since);
    return this.http.get<OrdersSinceResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/order`,
      { params },
    );
  }

  getActiveOrders(
    tenantId: string,
    branchId: string,
  ): Observable<OrdersResponse> {
    const params = new HttpParams().set('active', 'true');
    return this.http.get<OrdersResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/order`,
      { params },
    );
  }

  getDeliveryOrders(
    tenantId: string,
    branchId: string,
  ): Observable<OrdersResponse> {
    const params = new HttpParams().set('deliveryOnly', 'true');
    return this.http.get<OrdersResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/order`,
      { params },
    );
  }

  getOrdersByStatus(
    tenantId: string,
    branchId: string,
    status: OrderStatus,
  ): Observable<OrdersResponse> {
    const params = new HttpParams().set('status', status);
    return this.http.get<OrdersResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/order`,
      { params },
    );
  }

  getOrderTracking(
    trackingId: string,
  ): Observable<PublicOrderTrackingResponse> {
    return this.http.get<PublicOrderTrackingResponse>(
      `${this.base}/order/track/${trackingId}`,
    );
  }

  getPublicOrderTracking(
    trackingId: string,
  ): Observable<PublicOrderTrackingResponse> {
    return this.getOrderTracking(trackingId);
  }

  assignDriver(
    tenantId: string,
    branchId: string,
    orderId: string,
    driverId: string,
  ): Observable<OrderResponse> {
    return this.http.post<OrderResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/order/${orderId}/assign-driver`,
      { driverId },
    );
  }

  updateOrderStatus(
    tenantId: string,
    branchId: string,
    orderId: string,
    status: OrderStatus,
  ): Observable<OrderResponse> {
    return this.http.patch<OrderResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/order/${orderId}`,
      { status },
    );
  }

  updateDeliveryStatus(
    tenantId: string,
    branchId: string,
    orderId: string,
    dto: UpdateDeliveryStatusDto,
  ): Observable<OrderResponse> {
    return this.http.patch<OrderResponse>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/order/${orderId}/delivery`,
      dto,
    );
  }

  getDriverOrders(
    tenantId: string,
    branchId: string,
    driverId: string,
  ): Observable<Order[]> {
    const params = new HttpParams().set('driverId', driverId);
    return this.http.get<any>(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/order`,
      { params },
    ) as any;
  }

  updateDriverLocation(
    tenantId: string,
    branchId: string,
    driverId: string,
    latitude: number,
    longitude: number,
  ): Observable<any> {
    return this.http.patch(
      `${this.base}/tenant/${tenantId}/branch/${branchId}/driver/${driverId}/location`,
      {
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
      },
    );
  }
}

