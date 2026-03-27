import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { Dialog } from '@angular/cdk/dialog';
import { ErrorHandlerService } from '../../../core/services/error-handler.service';
import jsPDF from 'jspdf';
import { AuthService } from '../../../core/services/auth.service';
import {
  BusinessService,
  BranchSummary,
} from '../../../core/services/business.service';
import { OrderService } from '../../../core/services/order.service';
import { TableService } from '../../../core/services/table.service';
import {
  ProductService,
  Product,
} from '../../../core/services/product.service';
import { DataCacheService } from '../../../core/services/data-cache.service';
import { OrderDetailsDialogComponent } from '../../admin/orders/order-details-dialog.component';
import { LocalDateTimePipe } from '../../../shared/pipes/local-datetime.pipe';
import { PaymentDialogComponent } from '../tables/payment-dialog/payment-dialog.component';
import { CancelOrderDialogComponent } from '../../../shared/components/cancel-order-dialog/cancel-order-dialog.component';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import { OrdersBadgeService } from '../../../shared/services/orders-badge.service';
import { OrdersLiveStore } from '../../../core/services/orders-live-store.service';
import {
  AssignedUser,
  LoggedUser,
  User,
} from '../../../core/models/user.model';
import { UserService } from '../../../core/services/user.service';
import {
  Order,
  OrderItem,
  OrderItemDto,
  OrderItemStatusType,
  OrderStatusHistoryDto,
  RegisterPaymentDto,
  UpdateDeliveryStatusDto,
  UpdateOrderDto,
} from '../../../core/models/order.model';
import { PaymentDialogResult } from '../../../core/models/payment.model';
import { Size } from '../../../shared/services/size.service';

type OrderItemWithKey = NonNullable<Order['items']>[number];
type OrderBucket = 'preparing' | 'ready' | 'served';
type ActionError = string | null;

@Component({
  selector: 'app-user-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, LocalDateTimePipe],
  templateUrl: './orders.component.html',
})
export class UserOrdersComponent implements OnInit {
  private auth = inject(AuthService);
  private businessService = inject(BusinessService);
  private orderService = inject(OrderService);
  private tableService = inject(TableService);
  private dataCacheService = inject(DataCacheService);
  private dialog = inject(Dialog);
  private ordersBadge = inject(OrdersBadgeService);
  private branchSelection = inject(BranchSelectionService);
  private errorHandler = inject(ErrorHandlerService);
  private userService = inject(UserService);
  private ordersStore = inject(OrdersLiveStore);

  branches = signal<BranchSummary[]>([]);
  loggedUser = signal<LoggedUser | null>(null);
  orders = signal<Order[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  actionError = signal<ActionError>(null);
  userRoles = signal<string[]>([]);
  tablesById = signal<Map<string, string>>(new Map());
  usersById = signal<Map<string, string>>(new Map());
  productsById = signal<Map<string, string>>(new Map());
  subcategoryByProductId = signal<Map<string, string>>(new Map());
  sizes = signal<Size[]>([]);
  updatingItemKeys = signal<Set<string>>(new Set());
  updatingOrderIds = signal<Set<string>>(new Set());
  private initialLoadDone = false;

  readonly isAdmin = computed(() =>
    this.userRoles().some((role) => ['Admin', 'Super'].includes(role)),
  );
  readonly preparingOrders = computed(() =>
    this.orders().filter(
      (order) =>
        this.orderBucket(order.items) === 'preparing' &&
        !this.isOrderFullyPaid(order),
    ),
  );
  readonly readyOrders = computed(() =>
    this.orders().filter(
      (order) =>
        this.orderBucket(order.items) === 'ready' &&
        !this.isOrderFullyPaid(order),
    ),
  );
  readonly servedOrders = computed(() =>
    this.orders().filter(
      (order) =>
        this.orderBucket(order.items) === 'served' &&
        !this.isOrderFullyPaid(order),
    ),
  );
  readonly hasActiveOrders = computed(
    () => this.preparingOrders().length + this.readyOrders().length > 0,
  );
  // If there's at least one order, we can render immediately
  readonly hasOrders = computed(() => this.orders().length > 0);

  constructor() {
    // Update badge count whenever preparing orders change
    effect(() => {
      const count = this.preparingOrders().length;
      this.ordersBadge.setInProgressCount(count);
    });

    // React when admin changes branch from header (only after initial load)
    effect(() => {
      const branchId = this.branchSelection.selectedBranchId();
      if (branchId && this.isAdmin() && this.initialLoadDone) {
        this.loadTables(branchId);
        this.loadProducts(branchId);
        this.loadSizes(branchId);
        this.loadUsers(branchId);
        this.loadOrders();
      }
    });
    effect(() => {
      const branchId = this.branchSelection.getEffectiveBranchId();
      const ready = this.ordersStore.ready();
      const liveOrders = this.ordersStore.ordersList();

      if (!branchId || !ready) {
        return;
      }

      const incoming = liveOrders
        .filter((order) => order.branchId === branchId)
        .filter((order) => this.shouldKeepOrder(order))
        .sort((a, b) => this.compareOrders(a, b));

      this.orders.set(incoming);
      this.loading.set(false);
      this.error.set(null);
    });

  }


  ngOnInit(): void {
    this.loggedUser.set(this.auth.me());
    this.userRoles.set(this.auth.getRole() || []);

    if (!this.loggedUser()?.tenantId) {
      this.error.set('No se encontró el tenant actual.');
      return;
    }

    // First paint: do not block with heavy loads; schedule branch load very soon
    queueMicrotask(() => this.loadBranches());
  }

  refresh(): void {
    console.log('Manual refresh triggered');
    this.loadOrders();
  }

  openDetails(order: Order): void {
    console.log('Opening order details dialog for order:', order);
    if (!order?.id) {
      return;
    }

    this.dialog.open(OrderDetailsDialogComponent, {
      width: '760px',
      maxHeight: '90vh',
      data: {
        orderId: order.id,
        tenantId: this.loggedUser()?.tenantId,
        branchId: this.branchSelection.getEffectiveBranchId(),
        tableName: this.tableLabel(order),
        assignedToLabel: this.assignedTo(order),
        statusCode: this.normalizeOrderStatus(order.status),
        statusLabel: this.orderStatusLabel(order.status),
        productNameFallbacks: Object.fromEntries(this.productsById()),
      },
    });
  }

  isItemUpdating(key: string): boolean {
    console.log('Checking if item is updating for key:', key);
    return this.updatingItemKeys().has(key);
  }

  isOrderUpdating(orderId: string | undefined | null): boolean {
    return !!orderId && this.updatingOrderIds().has(orderId);
  }

  serveItem(order: Order, item: OrderItemWithKey, displayIndex: number): void {
    console.log('Serving item:', item, 'from order:', order);
    if (this.normalizeItemStatus(item.status ?? '') !== 'ready') {
      return;
    }
    const itemIndex = this.findItemIndex(order, item);
    if (itemIndex === -1) {
      console.warn('Order item not found in original payload', {
        orderId: order.id,
        item,
      });
      return;
    }
    this.updateItemStatus(order, item, displayIndex, itemIndex, 'served');
  }

  canCancelOrder(order: Order): boolean {
    console.log('Checking if order can be cancelled:', order);
    const status = this.normalizeOrderStatus(order.status);
    // Disallow if already terminal or served, or has any non-voided payments
    if (['cancelled', 'closed', 'paid', 'served'].includes(status))
      return false;
    const payments = (order.payments || []).filter(
      (p) => p.status !== 'voided',
    );
    if (payments.length > 0) return false;
    // Role restriction: only ADMIN, SUPER, Cajero
    const roles = this.userRoles().map((r) => r.toUpperCase());
    const allowed = roles.some((r) =>
      ['Admin', 'Super', 'Cajero'].includes(r),
    );
    if (!allowed) return false;
    return true;
  }

  cancelOrder(order: Order): void {
    console.log('Cancelling order:', order);
    if (!order?.id || !this.canCancelOrder(order)) {
      return;
    }

    // Open dialog to capture reason
    const ref = this.dialog.open<string>(CancelOrderDialogComponent, {
      width: '480px',
      disableClose: true,
    });
    ref.closed.subscribe((reason) => {
      const text = (reason || '').trim();
      if (text.length < 3) {
        this.updatingOrderIds.update((set) => {
          const next = new Set(set);
          next.delete(order.id!);
          return next;
        });
        return;
      }

      this.updatingOrderIds.update((set) => {
        const next = new Set(set);
        next.add(order.id!);
        return next;
      });

      const changedBy = this.loggedUser()?.id || 'System User';
      const history = order.statusHistory || [];
      const newHistory: OrderStatusHistoryDto = {
        status: { type: 'cancelled' },
        changedAt: new Date().toISOString(),
        changedBy,
      };

      const dto: UpdateOrderDto = {
        status: { type: 'cancelled' },
        statusHistory: [...history, newHistory],
        notes: text,
      };

      const branchId = this.branchSelection.getEffectiveBranchId();
      if (!branchId) {
        this.updatingOrderIds.update((set) => {
          const next = new Set(set);
          next.delete(order.id!);
          return next;
        });
        return;
      }
      this.orderService
        .updateOrder(this.loggedUser()?.tenantId!, branchId, order.id, dto)
        .subscribe({
          next: (res) => {
            this.updatingOrderIds.update((set) => {
              const next = new Set(set);
              next.delete(order.id!);
              return next;
            });
            // Liberar mesa si la orden estaba asignada a alguna
            const updated = res.data ?? null;
            const tableId = (
              (updated?.tableId ?? order.tableId) ||
              ''
            ).toString();
            const effBranch = branchId;
            const tenant = this.loggedUser()?.tenantId;
            if (tableId && tenant && effBranch) {
              this.tableService
                .updateTableStatus(tenant, effBranch, tableId, 0)
                .subscribe({
                  error: (e) =>
                    console.warn(
                      'No se pudo actualizar la mesa a Libre tras cancelar:',
                      e,
                    ),
                });
            }
            if (res.data) {
              this.mergeOrder(res.data);
            } else {
              this.loadOrders();
            }
          },
          error: (err) => {
            console.error('Error cancelling order', err);
            this.updatingOrderIds.update((set) => {
              const next = new Set(set);
              next.delete(order.id!);
              return next;
            });
            this.actionError.set(
              err?.error?.message || 'No se pudo cancelar la orden.',
            );
          },
        });
    });
  }

  serveOrder(order: Order): void {
    console.log('Serving entire order:', order);
    if (!order?.id || !order?.items?.length) {
      return;
    }

    const statuses = order.items
      .map((item) => this.normalizeItemStatus(item.status ?? ''))
      .filter((status) => status !== 'cancelled');

    if (!statuses.length) {
      return;
    }

    const hasReady = statuses.some((status) => status === 'ready');
    const hasPending = statuses.some((status) =>
      ['pending', 'preparing'].includes(status),
    );

    if (!hasReady || hasPending) {
      return;
    }

    this.updatingOrderIds.update((set) => {
      const next = new Set(set);
      next.add(order.id!);
      return next;
    });

    // Get all ready items that need to be marked as served
    const readyItems = (order.items || []).filter(
      (item) =>
        item.id && this.normalizeItemStatus(item.status ?? '') === 'ready',
    );

    // Update each ready item to 'Served' status using the new API
    const itemUpdates$ =
      readyItems.length > 0
        ? forkJoin(
          readyItems.map((item) =>
            this.orderService
              .updateOrderItem(order.id!, item.id!, { status: 'Served' })
              .pipe(catchError(() => of(null))),
          ),
        )
        : of([]);

    itemUpdates$
      .pipe(
        switchMap(() => {
          // After updating items, update the order status to 'served'
          return this.orderService.updateOrder(order.id!, { status: 'served' });
        }),
      )
      .subscribe({
        next: () => {
          this.updatingOrderIds.update((set) => {
            const next = new Set(set);
            next.delete(order.id!);
            return next;
          });
          this.actionError.set(null);
          // Reload orders to get fresh data
          this.loadOrders();
        },
        error: (err) => {
          this.updatingOrderIds.update((set) => {
            const next = new Set(set);
            next.delete(order.id!);
            return next;
          });
          console.error('Error serving order', err);
          this.actionError.set(
            err?.error?.message || 'No se pudo marcar la orden como servida.',
          );
        },
      });
  }

  canServeOrder(order: Order): boolean {
    console.log('Checking if order can be served:', order);
    if (!order?.items?.length) {
      return false;
    }
    const statuses = order.items
      .map((item) => this.normalizeItemStatus(item.status ?? ''))
      .filter((status) => status !== 'cancelled');
    if (!statuses.length) {
      return false;
    }
    const hasReady = statuses.some((status) => status === 'ready');
    const hasPending = statuses.some((status) =>
      ['pending', 'preparing'].includes(status),
    );
    return hasReady && !hasPending;
  }

  readyItemCount(order: Order): number {
    console.log('Counting ready items for order:', order);
    return (order.items || []).filter(
      (item) => this.normalizeItemStatus(item.status ?? '') === 'ready',
    ).length;
  }

  orderBucket(items: OrderItem[]): OrderBucket {
    const statuses = items
      ?.map((item) => this.normalizeItemStatus(item.status ?? ''))
      .filter((status) => status !== 'cancelled') || ['preparing'];

    if (!statuses.length) {
      return 'served';
    }
    if (statuses.every((status) => status === 'served')) {
      return 'served';
    }
    if (statuses.every((status) => ['ready', 'served'].includes(status))) {
      return 'ready';
    }
    return 'preparing';
  }

  progressSummary(items: OrderItem[]): string {
    const itemsSummary = (items || []).filter(
      (item) => this.normalizeItemStatus(item.status ?? '') !== 'cancelled',
    );
    const total = itemsSummary.length;
    if (total === 0) {
      return 'Sin productos activos';
    }

    const served = itemsSummary.filter(
      (item) => this.normalizeItemStatus(item.status ?? '') === 'served',
    ).length;
    if (served === total) {
      return 'Orden servida';
    }

    const ready = itemsSummary.filter(
      (item) => this.normalizeItemStatus(item.status ?? '') === 'ready',
    ).length;
    if (ready + served === total) {
      return 'Todo listo para servir';
    }

    const preparing = itemsSummary.filter(
      (item) => this.normalizeItemStatus(item.status ?? '') === 'preparing',
    ).length;
    const pending = itemsSummary.filter(
      (item) => this.normalizeItemStatus(item.status ?? '') === 'pending',
    ).length;

    const parts: string[] = [];
    if (ready + served > 0) {
      parts.push(`${ready + served} listos`);
    }
    if (preparing > 0) {
      parts.push(`${preparing} en preparacion`);
    }
    if (pending > 0) {
      parts.push(`${pending} pendientes`);
    }

    return parts.join(' | ') || 'Sin avance';
  }

  tableLabel(order: Order): string {
    if (order.tableName) {
      return order.tableName;
    }
    const tableId = order.tableId;
    if (!tableId) {
      return '-';
    }
    const tableMap = this.tablesById();
    return tableMap.get(tableId) || 'Mesa';
  }

  assignedTo(order: Order): string {
    const assigned = order.assignedToUserId || order.assignedTo as any;
    if (!assigned) {
      return 'Online';
    }
    if (typeof assigned === 'object') {
      const label = [assigned.fullName, assigned.name, assigned.email]
        .filter(
          (value): value is string =>
            !!value && value.toString().trim().length > 0,
        )
        .map((value) => value.toString().trim())[0];
      if (label) {
        return label;
      }
    }
    if (typeof assigned === 'string' && assigned.trim().length > 0) {
      const assignedLower = assigned.trim().toLowerCase();
      const mapped = this.usersById().get(assignedLower);
      if (mapped) {
        return mapped;
      }

      const currentUser = this.auth.me();
      if (currentUser && currentUser.id?.toLowerCase() === assignedLower) {
        return currentUser.fullName || currentUser.email || 'Tú (Admin)';
      }

      return `Mesero ${assigned.slice(0, 4)}...`;
    }
    return 'Sin asignar';
  }

  orderStatusBadge(status: string): string {
    const uppercaseStatus = this.normalizeOrderStatus(status).toUpperCase();
    switch (uppercaseStatus) {
      case 'CREATED':
        return 'badge-ghost';
      case 'PENDING':
        return 'badge-secondary';
      case 'PREPARING':
        return 'badge-warning';
      case 'READY':
        return 'badge-info';
      case 'SERVED':
        return 'badge-success';
      default:
        return 'badge-ghost';
    }
  }

  orderStatusLabel(status: string): string {
    return this.normalizeOrderStatus(status)
      .split('-')
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ');
  }

  itemStatusBadge(status: OrderItemStatusType): string {
    switch (status) {
      case 'pending':
        return 'badge badge-secondary';
      case 'preparing':
        return 'badge badge-warning';
      case 'ready':
        return 'badge badge-info';
      case 'served':
        return 'badge badge-success';
      case 'cancelled':
        return 'badge badge-error';
      default:
        return 'badge badge-ghost';
    }
  }

  itemStatusLabel(status: OrderItemStatusType): string {
    switch (status) {
      case 'pending':
        return 'Pendiente';
      case 'preparing':
        return 'Preparando';
      case 'ready':
        return 'Listo';
      case 'served':
        return 'Servido';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  }

  productLabel(item: OrderItemWithKey): string {
    // First, check if the item has productName directly from the API
    if (item.productName && item.productName.trim().length > 0) {
      return item.productName;
    }
    // Fallback to products map lookup
    const products = this.productsById();
    const fallback = item.productId ? products.get(item.productId) : undefined;
    if (fallback && fallback.trim().length > 0) {
      return fallback;
    }
    return 'Producto';
  }

  // Extract size label from product name or notes when available
  sizeBadgeLabel(item: OrderItemWithKey): string | null {
    console.log('Getting size badge label for item:', item);
    const sizeId = (item as any).sizeId as string | undefined;
    if (sizeId) {
      const sz = this.sizes().find((s) => s.id === sizeId);
      if (sz?.name) return sz.name;
    }
    const textSources: string[] = [];
    const directName = (item.productName || '').toString();
    if (directName) textSources.push(directName);
    const notes = this.notesLabel(item);
    if (notes) textSources.push(notes);

    const lookup = [
      { key: 'personal', label: 'Personal' },
      { key: 'mediana', label: 'Mediana' },
      { key: 'familiar', label: 'Familiar' },
    ];

    for (const source of textSources) {
      const normalized = source.toLowerCase();
      const hit = lookup.find((e) => normalized.includes(e.key));
      if (hit) return hit.label;
    }
    return null;
  }

  // Best-effort subcategory label based on loaded product catalog
  subcategoryBadgeLabel(item: OrderItemWithKey): string | null {
    console.log('Getting subcategory badge label for item:', item);
    const map = this.subcategoryByProductId();
    if (item.productId && map.has(item.productId)) {
      const label = map.get(item.productId);
      if (label && label.trim().length > 0) return label;
    }
    // As a fallback, try to infer from productName (public orders already include it)
    const name = (item.productName || '').toString();
    // Heuristic: if name contains "Mitad", skip (ambiguous half&half)
    if (name && !/\bmitad\b/i.test(name)) {
      // If name starts with category + size + subcategory + product, try to pick last token before base product name
      // This is intentionally conservative: look for common pizza subcategory keywords
      const known = ['tradicional', 'especial', 'premium', 'infantil'];
      const lower = name.toLowerCase();
      const hit = known.find((k) => lower.includes(k));
      if (hit) {
        // Capitalize first letter
        return hit.charAt(0).toUpperCase() + hit.slice(1);
      }
    }
    return null;
  }

  modifierLabel(mod: any): string {
    if (!mod) {
      return 'Extra';
    }
    const candidates = [
      typeof mod === 'string' ? mod : '',
      typeof mod.modifierName === 'string' ? mod.modifierName : '',
      typeof mod.name === 'string' ? mod.name : '',
      typeof mod?.modifier?.name === 'string' ? mod.modifier.name : '',
    ];
    const label = candidates.find((value) => value && value.trim().length > 0);
    return label ? label.trim() : 'Extra';
  }

  itemKey(order: Order, item: OrderItemWithKey, index: number): string {
    console.log('Generating item key for order and item:', order, item);
    return [order.id, item.id || item.productId || index].join('::');
  }

  itemsInDisplayOrder(items: OrderItem[]): OrderItemWithKey[] {
    return [...(items || [])].sort((a, b) => {
      const score = (status: OrderItemStatusType): number => {
        switch (status) {
          case 'pending':
            return 0;
          case 'preparing':
            return 1;
          case 'ready':
            return 2;
          case 'served':
            return 3;
          case 'cancelled':
            return 4;
          default:
            return 5;
        }
      };
      return (
        score(this.normalizeItemStatus(a.status ?? '')) -
        score(this.normalizeItemStatus(b.status ?? ''))
      );
    });
  }

  notesLabel(item: OrderItemWithKey): string | null {
    if (typeof item.notes === 'string' && item.notes.trim().length > 0) {
      return item.notes.trim();
    }
    return null;
  }

  normalizeItemStatus(status: string): OrderItemStatusType {
    const raw =
      typeof status === 'string'
        ? status
        : ((status as { type?: string } | undefined)?.type ?? '');
    const normalized = String(raw || '')
      .toLowerCase()
      .trim();
    const allowed: OrderItemStatusType[] = [
      'pending',
      'preparing',
      'ready',
      'served',
      'cancelled',
    ];
    return allowed.includes(normalized as OrderItemStatusType)
      ? (normalized as OrderItemStatusType)
      : 'pending';
  }

  private normalizeOrderStatus(status: string): string {
    const raw = status as any;
    if (typeof raw === 'string') {
      return raw.toLowerCase();
    }
    if (raw && typeof raw === 'object' && 'type' in raw) {
      return String(raw.type || '').toLowerCase();
    }
    return 'created';
  }

  readyItems(order: Order): OrderItemWithKey[] {
    console.log('Getting ready items for order:', order);
    return (order.items || []).filter(
      (item) => this.normalizeItemStatus(item.status ?? '') === 'ready',
    );
  }

  private findItemIndex(order: Order, target: OrderItemWithKey): number {
    console.log('Finding item index for target item in order:', order, target);
    const items = order.items || [];
    const byReference = items.findIndex((candidate) => candidate === target);
    if (byReference !== -1) {
      return byReference;
    }
    if (target.id) {
      const byId = items.findIndex((candidate) => candidate.id === target.id);
      if (byId !== -1) {
        return byId;
      }
    }
    if (target.productId) {
      const byProduct = items.findIndex(
        (candidate) => candidate.productId === target.productId,
      );
      if (byProduct !== -1) {
        return byProduct;
      }
    }
    return -1;
  }

  private updateItemStatus(
    order: Order,
    item: OrderItemWithKey,
    displayIndex: number,
    itemIndex: number,
    nextStatus: OrderItemStatusType,
  ): void {
    console.log('Updating item status for item:', item, 'in order:', order);
    if (!order?.id) {
      return;
    }

    const key = this.itemKey(order, item, displayIndex);
    this.updatingItemKeys.update((set) => {
      const next = new Set(set);
      next.add(key);
      return next;
    });

    const updatedItems = (order.items || []).map((existing, idx) => {
      if (idx !== itemIndex) {
        return existing;
      }
      return {
        ...existing,
        status: nextStatus,
      } as OrderItem;
    });

    const newOrderStatus = this.deriveOrderStatus(updatedItems);
    const user = this.loggedUser();
    const changedBy = user?.id || 'System User';

    // Add statusHistory entry for the order status change
    const existingHistory = order.statusHistory || [];
    const newHistory: OrderStatusHistoryDto = {
      status: { type: newOrderStatus },
      changedAt: new Date().toISOString(),
      changedBy,
    };

    const dto: UpdateOrderDto = {
      items: updatedItems.map((orderItem) => this.toOrderItemDto(orderItem)),
      status: { type: newOrderStatus },
      statusHistory: [...existingHistory, newHistory],
    };

    const __branchId2 = this.branchSelection.getEffectiveBranchId();
    if (!__branchId2) return;
    this.orderService
      .updateOrder(this.loggedUser()?.tenantId!, __branchId2, order.id, dto)
      .subscribe({
        next: (res) => {
          this.updatingItemKeys.update((set) => {
            const next = new Set(set);
            next.delete(key);
            return next;
          });
          this.actionError.set(null);
          if (res.data) {
            this.mergeOrder(res.data);
          } else {
            this.loadOrders();
          }
        },
        error: (err) => {
          this.updatingItemKeys.update((set) => {
            const next = new Set(set);
            next.delete(key);
            return next;
          });
          console.error('Error updating item status', err);
          this.actionError.set(
            err?.error?.message ||
            'No se pudo actualizar el estatus del producto.',
          );
        },
      });
  }

  private deriveOrderStatus(
    items: OrderItemWithKey[],
  ): 'created' | 'preparing' | 'ready' | 'served' {
    console.log('Deriving order status from items:', items);
    const statuses = items
      .map((item) => this.normalizeItemStatus(item.status ?? ''))
      .filter((status) => status !== 'cancelled');
    if (!statuses.length) {
      return 'served';
    }
    if (statuses.every((status) => status === 'served')) {
      return 'served';
    }
    if (statuses.every((status) => ['ready', 'served'].includes(status))) {
      return 'ready';
    }
    if (statuses.some((status) => status === 'preparing')) {
      return 'preparing';
    }
    return 'created';
  }

  private toOrderItemDto(item: OrderItemWithKey): OrderItemDto {
    console.log('Mapping order item to DTO:', item);
    const qty = this.resolveQuantity((item as any).quantity ?? 1);
    const subtotal = this.resolveSubtotal(item, qty);
    const status = this.normalizeItemStatus(item.status ?? '');
    const mappedModifiers = (item.modifiers || [])
      .map((mod: any) => {
        const modifierId =
          mod.modifierId || mod.id || mod.modifier?.id || mod._id || '';
        if (!modifierId) {
          return null;
        }
        const modifierGroupId =
          mod.modifierGroupId ||
          mod.groupId ||
          mod.modifierGroup?.id ||
          mod.modifierGroup?._id ||
          '';
        if (!modifierGroupId) {
          return null;
        }
        return {
          modifierGroupId,
          modifierId,
          name: this.modifierLabel(mod),
          price:
            typeof mod.price === 'number'
              ? mod.price
              : typeof mod.additionalPrice === 'number'
                ? mod.additionalPrice
                : 0,
          portion:
            typeof mod.portion === 'number'
              ? mod.portion
              : Math.max(1, Number(mod.quantity) || 1),
        };
      })
      .filter((mod): mod is NonNullable<typeof mod> => !!mod);

    return {
      id: item.id,
      productId: item.productId,
      qty,
      modifiers: mappedModifiers,
      notes: item.notes,
      taxes: (item.taxes as any[]) || [],
      discounts: (item.discounts as any[]) || [],
      status: { type: status },
      subtotal,
    };
  }

  private resolveQuantity(qty: number): number {
    const rawQty = qty ?? 1;
    return Number.isFinite(Number(rawQty)) && Number(rawQty) > 0
      ? Math.round(Number(rawQty))
      : 1;
  }

  private resolveSubtotal(item: OrderItemWithKey, qty: number): number {
    console.log('Resolving subtotal for item:', item, 'with qty:', qty);
    if (typeof item.subtotal === 'number' && !Number.isNaN(item.subtotal)) {
      return this.roundCurrency(item.subtotal);
    }
    const unitPriceSource = (item as { unitPrice?: number }).unitPrice;
    const unitPrice = typeof unitPriceSource === 'number' && !Number.isNaN(unitPriceSource) ? unitPriceSource : 0;
    return this.roundCurrency(unitPrice * qty);
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private mergeOrder(updated: Order): void {
    console.log('Merging updated order into store:', updated);
    this.orders.update((orders) => {
      const filtered = orders.filter(
        (candidate) => candidate.id !== updated.id,
      );
      if (this.shouldKeepOrder(updated)) {
        filtered.push(updated);
        filtered.sort((a, b) => this.compareOrders(a, b));
      }
      return filtered;
    });
  }

  private shouldKeepOrder(order: Order): boolean {
    const status = this.normalizeOrderStatus(order.status);
    // Keep cancelled orders out
    if (status === 'cancelled') {
      return false;
    }
    // For 'paid' or 'closed' status, verify if order is actually fully paid
    // If there's outstanding balance (partial payment), keep it visible
    if (['paid', 'closed'].includes(status)) {
      const fullyPaid = this.isOrderFullyPaid(order);
      if (!fullyPaid) {
        // Partial payment: keep order visible
        return true;
      }
      // Fully paid: hide from active orders view
      return false;
    }
    if (!order.items || order.items.length === 0) {
      return false;
    }
    const activeItems = order.items.filter(
      (item) => this.normalizeItemStatus(item.status ?? '') !== 'cancelled',
    );
    return activeItems.length > 0;
  }

  private compareOrders(a: Order, b: Order): number {
    const dateA = this.parseOrderDate(a.createdAt) ?? 0;
    const dateB = this.parseOrderDate(b.createdAt) ?? 0;
    return dateA - dateB;
  }

  private parseOrderDate(date?: string | null): number | null {
    if (!date) {
      return null;
    }
    const parsed = Date.parse(date);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private loadBranches(): void {
    const user = this.loggedUser();

    if (!this.isAdmin() && user?.branchId) {
      this.businessService.getBranch(user.branchId).subscribe({
        next: (res) => {
          const branch = res;
          this.branches.set(branch ? [branch] : []);
          if (branch) {
            this.branchSelection.setSelectedBranchId(branch.id);
            this.loadTables(branch.id);
            this.loadProducts(branch.id);
            this.loadSizes(branch.id);
            this.loadUsers(branch.id);
            this.loadOrders();
          }
        },
        error: (err) => {
          console.error('Error loading branch for orders view', err);
          this.error.set('No se pudo cargar la sucursal.');
        },
      });
      return;
    }

    // Admin user: load all branches and use persisted selection or first one
    this.businessService.getBranches().subscribe({
      next: (res) => {
        const branches = res || [];
        this.branches.set(branches);
        if (branches.length > 0) {
          // Check if there's a persisted branch selection
          const persistedBranchId = this.branchSelection.selectedBranchId();
          const branchToUse =
            persistedBranchId &&
              branches.some((b) => b.id === persistedBranchId)
              ? persistedBranchId
              : branches[0].id;

          // Only set if different to avoid overwriting
          if (persistedBranchId !== branchToUse) {
            this.branchSelection.setSelectedBranchId(branchToUse);
          }

          // Load initial data for the selected branch
          // Defer heavy branch-dependent resource loads slightly to avoid blocking first paint
          // Stagger heavy loads: tables immediately, products & sizes after idle
          this.loadTables(branchToUse);
          setTimeout(() => this.loadProducts(branchToUse), 50);
          setTimeout(() => this.loadSizes(branchToUse), 100);
          setTimeout(() => this.loadUsers(branchToUse), 125);
          setTimeout(() => this.loadOrders(), 150);
          this.initialLoadDone = true;
          // initialLoadDone set inside microtask
        }
      },
      error: (err) => {
        console.error('Error loading branches for orders view', err);
        this.error.set('No se pudieron cargar las sucursales.');
      },
    });
  }

  private loadUsers(branchId: string): void {
    if (!branchId) {
      this.usersById.set(new Map());
      return;
    }

    this.userService.getBranchUsers(branchId).subscribe({
      next: (res: any) => {
        const entries = (res || []).map((user: any) => {
          const identifier =
            user?.id ?? user?._id ?? user?.userId ?? user?.uid ?? null;
          if (!identifier) {
            return null;
          }
          const fullName =
            typeof user?.fullName === 'string'
              ? user.fullName.trim()
              : typeof user?.firstName === 'string' && typeof user?.lastName === 'string'
                ? `${user.firstName} ${user.lastName}`.trim()
                : '';
          const shortName =
            typeof user?.name === 'string'
              ? user.name.trim()
              : typeof user?.firstName === 'string'
                ? user.firstName.trim()
                : '';
          const email =
            typeof user?.email === 'string' ? user.email.trim() : '';
          const display =
            fullName || shortName || email || String(identifier).trim();
          return [String(identifier).toLowerCase(), display] as [string, string];
        });
        const validEntries = entries.filter((entry: any): entry is [string, string] => !!entry);
        this.usersById.set(new Map(validEntries));
      },
      error: (err: any) => {
        console.error('Error loading users for orders view:', err);
        this.usersById.set(new Map());
      },
    });
  }

  private loadTables(branchId: string): void {
    const tenantId = this.loggedUser()?.tenantId;
    if (!tenantId || !branchId) {
      this.tablesById.set(new Map());
      return;
    }
    // Use cached tables from DataCacheService
    const tablesMap = this.dataCacheService.getTablesMap(tenantId, branchId);
    this.tablesById.set(tablesMap);
  }

  private loadProducts(branchId: string): void {
    const tenantId = this.loggedUser()?.tenantId;
    if (!tenantId || !branchId) {
      this.productsById.set(new Map());
      this.subcategoryByProductId.set(new Map());
      return;
    }
  }

  private loadSizes(branchId: string): void {
    const tenantId = this.loggedUser()?.tenantId;
    if (!tenantId || !branchId) {
      this.sizes.set([]);
      return;
    }
  }

  private async loadOrders(): Promise<void> {
    const effBranch = this.branchSelection.getEffectiveBranchId();
    if (!this.loggedUser()?.tenantId || !effBranch) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.actionError.set(null);

    const cacheKey = `active-orders:${this.loggedUser()?.tenantId
      }:${effBranch}`;

    try {
      // Use the correct endpoint: /api/orders/open with branchId filter
      const ordersArray = await this.orderService
        .listOpenOrders({ branchId: effBranch, expand: 'items' })
        .toPromise();

      if (!ordersArray) throw new Error('No se recibió respuesta del servidor');

      // The response is an array of { order, items } objects, we need to merge them
      const incoming = ordersArray
        .map((item: any) => {
          // If the response has { order, items } structure, merge them
          if (item.order) {
            return { ...item.order, items: item.items || [] };
          }
          // If it's just the order object directly
          return item;
        })
        .filter((order: Order) => this.shouldKeepOrder(order))
        .sort((a: Order, b: Order) => this.compareOrders(a, b));

      this.orders.set(incoming);

      // Guardar en localStorage para fallback futuro
      try {
        localStorage.setItem(cacheKey, JSON.stringify(incoming));
      } catch (e) {
        console.warn('No se pudo guardar en caché:', e);
      }

      this.loading.set(false);
    } catch (err: any) {
      console.error('Error loading active orders', err);

      // Manejar error con contexto
      const handled = this.errorHandler.handleError(err, {
        operation: 'cargar órdenes activas',
        serviceName: 'OrderService',
        tenantId: this.loggedUser()?.tenantId,
        branchId: effBranch,
      });

      // Intentar fallback a caché
      if (handled.canRetry) {
        try {
          const cachedStr = localStorage.getItem(cacheKey);
          const cached = cachedStr ? (JSON.parse(cachedStr) as Order[]) : null;
          if (cached && cached.length > 0) {
            console.warn('✅ Usando órdenes desde caché (fallback)');
            this.orders.set(cached);
            this.error.set(
              'Mostrando órdenes en caché. La conexión con el servidor se restablecerá automáticamente.',
            );
          } else {
            this.error.set(handled.userMessage);
          }
        } catch (cacheError) {
          console.error('Error leyendo caché:', cacheError);
          this.error.set(handled.userMessage);
        }
      } else {
        this.error.set(handled.userMessage);
      }

      this.loading.set(false);
    }
  }

  formatCurrency(value: number): string {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `$${value.toFixed(0)}`;
    }
  }

  isPublicMenuOrder(source: string): boolean {
    return source === 'public-menu';
  }

  canMarkAssigned(order: Order): boolean {
    console.log(
      'Checking if delivery can be marked as assigned for order:',
      order,
    );
    if (!this.isPublicMenuOrder(order.source!)) return false;
    const st = this.normalizeOrderStatus(order.status);
    // Only allow if order is ready and not already assigned/picked/delivered
    const currentDelivery = (order as any).deliveryStatus as string | undefined;
    if (['delivered', 'failed'].includes((currentDelivery || '').toLowerCase()))
      return false;
    return st === 'ready' && (currentDelivery || 'pending') === 'pending';
  }

  markDeliveryAssigned(order: Order): void {
    console.log('Marking delivery as assigned for order:', order);
    if (!order?.id || !this.canMarkAssigned(order)) return;
    this.updatingOrderIds.update((set) => new Set(set).add(order.id!));
    const user = this.loggedUser();
    const changedBy = user?.id || 'System User';
    const dto: UpdateDeliveryStatusDto = { status: 'assigned', changedBy };
    this.orderService.updatePublicDeliveryStatus(order.id!, dto).subscribe({
      next: (res) => {
        // Optimistic local update so UI reflects immediately
        (order as any).deliveryStatus = 'assigned';
        this.updatingOrderIds.update((set) => {
          const next = new Set(set);
          next.delete(order.id!);
          return next;
        });
      },
      error: (err) => {
        console.error('Error marcando repartidor asignado', err);
        this.actionError.set(
          err?.error?.message || 'No se pudo marcar como asignado.',
        );
        this.updatingOrderIds.update((set) => {
          const next = new Set(set);
          next.delete(order.id!);
          return next;
        });
      },
    });
  }

  canGenerateSaleTicket(order: Order): boolean {
    // Allow ticket generation for ready or served orders
    console.log('Checking if sale ticket can be generated for order:', order);
    const bucket = this.orderBucket(order.items);
    return bucket === 'ready' || bucket === 'served';
  }

  orderTotal(order: Order): number {
    if (typeof order.total === 'number' && Number.isFinite(order.total) && order.total > 0) {
      return this.roundCurrency(order.total);
    }

    const productsSubtotal = this.calculateItemsSubtotal(order);
    const discountsTotal = this.roundCurrency(
      Math.min(productsSubtotal, this.calculateDiscountsTotal(order)),
    );
    const baseAfterDiscount = this.roundCurrency(
      Math.max(0, productsSubtotal - discountsTotal),
    );

    let includedTotal = 0;
    let additiveTotal = 0;
    for (const tax of (order.taxes as any[]) || []) {
      const amount = this.roundCurrency(
        Math.max(0, typeof tax?.value === 'number' ? tax.value : 0),
      );
      if (amount <= 0) continue;
      if (tax?.isIncluded) includedTotal += amount;
      else additiveTotal += amount;
    }
    includedTotal = this.roundCurrency(includedTotal);
    additiveTotal = this.roundCurrency(additiveTotal);

    const netSubtotal = this.roundCurrency(
      includedTotal > 0
        ? Math.max(0, baseAfterDiscount - includedTotal)
        : baseAfterDiscount,
    );
    const deliveryFee = this.deliveryFeeAmount(order);
    const total = this.roundCurrency(
      netSubtotal + includedTotal + additiveTotal + deliveryFee,
    );
    return total > 0 ? total : 0;
  }

  deliveryFeeAmount(order: Order): number {
    const fee = order.delivery?.fee;
    return typeof fee === 'number' && Number.isFinite(fee)
      ? this.roundCurrency(Math.max(0, fee))
      : 0;
  }

  private shouldShowDeliveryFee(order: Order): boolean {
    return !!(order.requiresDelivery || order.delivery?.requiresDelivery || !order.isTakeaway || this.deliveryFeeAmount(order) > 0);
  }

  private calculateItemsSubtotal(order: Order): number {
    if (!order.items || order.items.length === 0) {
      return 0;
    }

    return order.items.reduce((sum, item) => {
      if (typeof item.subtotal === 'number' && !Number.isNaN(item.subtotal)) {
        return sum + item.subtotal;
      }
      const quantity = Math.max(1, item.quantity ?? 1);
      const unitPrice = typeof item.unitPrice === 'number' && !Number.isNaN(item.unitPrice) ? item.unitPrice : 0;
      return sum + (unitPrice * quantity);
    }, 0);
  }

  private calculateDiscountsTotal(order: Order): number {
    if (
      typeof order.discountsTotal === 'number' &&
      order.discountsTotal !== 0
    ) {
      return Math.abs(order.discountsTotal);
    }
    if (!order.discounts || order.discounts.length === 0) {
      return 0;
    }
    return order.discounts.reduce((sum, disc) => {
      const raw =
        typeof (disc as any).value === 'number' ? (disc as any).value : 0;
      return sum + Math.abs(raw);
    }, 0);
  }

  orderPaidAmount(order: Order): number {
    console.log('Calculating order paid amount for order:', order);
    if (!order.payments || order.payments.length === 0) {
      return 0;
    }
    return order.payments
      .filter((p) => p.status !== 'voided')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  }

  orderOutstanding(order: Order): number {
    console.log('Calculating order outstanding amount for order:', order);
    const total = this.orderTotal(order);
    const paid = this.orderPaidAmount(order);
    return Math.max(0, total - paid);
  }

  isOrderFullyPaid(order: Order): boolean {
    // Check order status first
    const status = (order.status || '').toString().toLowerCase();
    if (status === 'paid' || status === 'closed') {
      return true;
    }
    // Then check if outstanding is zero
    return this.orderOutstanding(order) <= 0;
  }

  openPaymentDialog(order: Order): void {
    console.log('Opening payment dialog for order:', order);
    const total = this.orderTotal(order);
    const paid = this.orderPaidAmount(order);
    const outstanding = this.orderOutstanding(order);

    const dialogRef = this.dialog.open(PaymentDialogComponent, {
      width: '500px',
      data: {
        total,
        paid,
        outstanding,
        currency: 'COP',
        payments: order.payments || [],
      },
    });

    dialogRef.closed.subscribe((result) => {
      const paymentResult = result as PaymentDialogResult | undefined;
      if (paymentResult && paymentResult.method && paymentResult.amount) {
        this.registerPayment(order, paymentResult);
      }
    });
  }

  private registerPayment(order: Order, result: PaymentDialogResult): void {
    console.log(
      'Registering payment for order:',
      order,
      'with result:',
      result,
    );
    if (!order.id) {
      return;
    }

    const normalizedAmount = this.roundCurrency(result.amount);
    if (normalizedAmount <= 0) {
      alert('Ingresa un monto válido para el pago.');
      return;
    }

    // Protection against duplicate registrations
    if (this.updatingOrderIds().has(order.id!)) {
      console.warn('[Orders] Payment already processing for order:', order.id);
      return;
    }

    // Mark as updating
    this.updatingOrderIds.update((set) => {
      const next = new Set(set);
      next.add(order.id!);
      return next;
    });

    const normalizedStatus = (order.status || '').toString().toLowerCase();
    const canPay = ['submitted', 'partiallypaid'].includes(normalizedStatus);

    // If order is not in a payable status, first update to Submitted, then pay
    if (!canPay) {
      this.orderService
        .updateOrder(order.id, { status: 'Submitted' })
        .subscribe({
          next: () => this.processOrderPayment(order, result, normalizedAmount),
          error: (err) => {
            console.error('Error updating order status:', err);
            this.updatingOrderIds.update((set) => {
              const next = new Set(set);
              next.delete(order.id!);
              return next;
            });
            this.actionError.set('No se pudo preparar la orden para el pago.');
          },
        });
    } else {
      this.processOrderPayment(order, result, normalizedAmount);
    }
  }

  private processOrderPayment(
    order: Order,
    result: PaymentDialogResult,
    normalizedAmount: number,
  ): void {
    const effBranch2 = this.branchSelection.getEffectiveBranchId();

    this.orderService
      .createPayment(order.id!, {
        amount: normalizedAmount,
        method: result.method,
        reference: result.reference || '',
      })
      .subscribe({
        next: () => {
          // Reload the order to get updated status and payments
          this.orderService.getOrder(order.id!, { expand: 'items' }).subscribe({
            next: (updated) => {
              if (updated) {
                const status = (updated.status || '').toString().toLowerCase();
                const closedByBackend =
                  status === 'paid' || status === 'closed';
                const tableId = (
                  updated.tableId ||
                  order.tableId ||
                  ''
                ).toString();

                // If order is paid and has a table, free the table
                if (
                  closedByBackend &&
                  tableId &&
                  this.loggedUser()?.tenantId &&
                  effBranch2
                ) {
                  this.tableService
                    .updateTableStatus(
                      this.loggedUser()?.tenantId!,
                      effBranch2,
                      tableId,
                      0,
                    )
                    .subscribe({
                      error: (e) =>
                        console.warn(
                          'No se pudo actualizar la mesa a Libre tras pago:',
                          e,
                        ),
                    });
                }

                this.mergeOrder(updated);
              }

              this.updatingOrderIds.update((set) => {
                const next = new Set(set);
                next.delete(order.id!);
                return next;
              });
              this.actionError.set(null);
            },
            error: () => {
              // Even if order refresh fails, reload all orders
              this.loadOrders();
              this.updatingOrderIds.update((set) => {
                const next = new Set(set);
                next.delete(order.id!);
                return next;
              });
            },
          });
        },
        error: (err) => {
          console.error('Error registering payment', err);
          this.updatingOrderIds.update((set) => {
            const next = new Set(set);
            next.delete(order.id!);
            return next;
          });

          this.actionError.set(
            err?.error?.message || 'No se pudo registrar el pago.',
          );
        },
      });
  }

  generateSaleTicket(order: Order): void {
    console.log('Generating sale ticket for order:', order);
    if (!order?.items?.length) {
      alert('No hay productos en la orden para generar el ticket.');
      return;
    }

    const branchId = this.branchSelection.getEffectiveBranchId();
    if (!branchId) {
      alert('No se pudo determinar la sucursal.');
      return;
    }

    // Use the already loaded branches data
    const branch = this.branches().find((b) => b.id === branchId) || null;
    this.renderSaleTicket(order, null, branch);
  }

  private renderSaleTicket(order: Order, business: any, branch: any): void {
    console.log('Rendering sale ticket for order:', order);
    const doc = new jsPDF({ unit: 'mm', format: [80, 200] });
    const baseFontSize = 10;
    doc.setFontSize(baseFontSize);
    const margin = 6;
    const defaultLineHeight = 4.5;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    let cursorY = margin;

    // Helper to add logo
    const addLogo = () => {
      try {
        const logoWidth = 40;
        const logoHeight = 30;
        const logoX = (pageWidth - logoWidth) / 2;
        doc.addImage(
          '/images/logo-bw.png',
          'PNG',
          logoX,
          cursorY,
          logoWidth,
          logoHeight,
        );
        cursorY += logoHeight + 10;
      } catch (err) {
        console.warn('Could not load logo for ticket:', err);
      }
    };

    const ensureSpace = (lines = 1, lineHeight = defaultLineHeight) => {
      const pageHeight = doc.internal.pageSize.getHeight();
      if (cursorY + lines * lineHeight > pageHeight - margin) {
        doc.addPage([80, 200]);
        cursorY = margin;
      }
    };

    const writeBlock = (
      text: string | string[],
      options: {
        align?: 'left' | 'right' | 'center';
        bold?: boolean;
        indent?: number;
        lineHeight?: number;
      } = {},
    ) => {
      const {
        align = 'left',
        bold = false,
        indent = 0,
        lineHeight = defaultLineHeight,
      } = options;
      const lines = Array.isArray(text) ? text : [text];
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      for (const line of lines) {
        if (line === undefined || line === null) continue;
        if (line === '') {
          ensureSpace(1, lineHeight);
          cursorY += lineHeight;
          continue;
        }
        const splitted = doc.splitTextToSize(line, contentWidth - indent);
        for (const segment of splitted) {
          ensureSpace(1, lineHeight);
          const x =
            align === 'center'
              ? pageWidth / 2
              : align === 'right'
                ? pageWidth - margin
                : margin + indent;
          doc.text(segment, x, cursorY, { align });
          cursorY += lineHeight;
        }
      }
    };

    const writeLineWithAmount = (
      label: string,
      amount: string,
      opts: { bold?: boolean; indent?: number } = {},
    ) => {
      const { bold = false, indent = 0 } = opts;
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const usableWidth = Math.max(contentWidth - 18 - indent, 20);
      const splitted = doc.splitTextToSize(label, usableWidth);
      for (let i = 0; i < splitted.length; i++) {
        ensureSpace();
        const xLabel = margin + indent + (i === 0 ? 0 : 2);
        doc.text(splitted[i], xLabel, cursorY);
        if (i === 0) {
          doc.text(amount, pageWidth - margin, cursorY, { align: 'right' });
        }
        cursorY += defaultLineHeight;
      }
    };

    const drawDivider = () => {
      ensureSpace(1, 1);
      doc.setDrawColor(180);
      doc.setLineWidth(0.1);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      doc.setDrawColor(0);
      cursorY += 6;
    };

    const orderTimestamp =
      order.updatedAt || order.createdAt || new Date().toISOString();
    // Detectar orden pública por source O por presencia de customer
    const isPublicOrder = order.source === 'public-menu' || !!order.customer;

    addLogo();

    // Header
    doc.setFontSize(baseFontSize + 2);
    writeBlock(business?.name || 'Ticket de venta', {
      align: 'center',
      bold: true,
    });
    doc.setFontSize(baseFontSize);
    if (business?.nit) {
      writeBlock(`NIT: ${business.nit}`, { align: 'center' });
    }
    if (branch?.name) {
      writeBlock(branch.name, { align: 'center' });
    }
    if (branch?.address) {
      writeBlock(branch.address, { align: 'center' });
    }
    if (branch?.phone) {
      writeBlock(`Tel: ${branch.phone}`, { align: 'center' });
    }
    writeBlock(`Fecha: ${this.formatDateTime(orderTimestamp)}`, {
      align: 'center',
    });
    if (order.code) {
      writeBlock(`Orden: ${order.code}`, { align: 'center' });
    }

    // Customer info for public orders
    if (isPublicOrder && order.customer) {
      writeBlock('', {});
      drawDivider();
      writeBlock('Datos del Cliente', { bold: true, align: 'center' });
      writeBlock(`Nombre: ${order.customer.name}`, { align: 'left' });
      writeBlock(`Teléfono: ${order.customer.phone}`, { align: 'left' });
      if (order.customer.address) {
        writeBlock(`Dirección: ${order.customer.address}`, { align: 'left' });
      }
      if (order.customer.notes) {
        writeBlock(`Notas: ${order.customer.notes}`, { align: 'left' });
      }
      if (order.isTakeaway === false) {
        writeBlock('Tipo: Entrega a domicilio', { align: 'left', bold: true });
      } else {
        writeBlock('Tipo: Para llevar', { align: 'left', bold: true });
      }
    } else {
      const tableName = this.tableLabel(order);
      writeBlock(`Mesa: ${tableName}`, { align: 'center' });
      const cashier = this.assignedTo(order);
      if (cashier) {
        writeBlock(`Atendido por: ${cashier}`, { align: 'center' });
      }
    }

    writeBlock('', {});
    drawDivider();

    // Products
    doc.setFontSize(baseFontSize);
    doc.setFont('helvetica', 'bold');
    doc.text('Detalle', margin, cursorY);
    doc.text('Total', pageWidth - margin, cursorY, { align: 'right' });
    cursorY += defaultLineHeight;
    doc.setFont('helvetica', 'normal');

    order.items.forEach((item) => {
      const quantity = this.resolveQuantity((item as any).quantity ?? 1);
      let name = this.productLabel(item);
      // Add size/portion if available
      const sizeLabel = item.sizeName || this.sizeBadgeLabel(item);
      if (sizeLabel) {
        name = `${name} (${sizeLabel})`;
      }
      const lineLabel = `${quantity} x ${name}`;
      const itemSubtotal = this.resolveSubtotal(item, quantity);
      const itemTotal = this.formatCurrency(itemSubtotal);
      writeLineWithAmount(lineLabel, itemTotal);

      if (item.modifiers && item.modifiers.length > 0) {
        item.modifiers.forEach((modifier) => {
          const modParts = [this.modifierLabel(modifier)];
          if (modifier.quantity && modifier.quantity > 1) {
            modParts.push(`x${modifier.quantity}`);
          }
          if (modifier.additionalPrice && modifier.additionalPrice > 0) {
            modParts.push(`+${this.formatCurrency(modifier.additionalPrice)}`);
          }
          writeBlock(`- ${modParts.join(' ')}`, { indent: 4 });
        });
      }

      const notes = this.notesLabel(item);
      if (notes && notes !== name) {
        writeBlock(`${notes}`, { indent: 4 });
      }
    });

    drawDivider();

    // Subtotal: usar el mismo criterio que en las órdenes (netSubtotal del backend si existe).
    const backendSubtotal =
      typeof (order as any).subtotal === 'number'
        ? (order as any).subtotal
        : null;
    let subtotal = 0;
    if (
      backendSubtotal !== null &&
      Number.isFinite(backendSubtotal) &&
      backendSubtotal > 0
    ) {
      subtotal = this.roundCurrency(backendSubtotal);
    } else {
      // Fallback: calcular netSubtotal correctamente con impuestos incluidos
      const productsSubtotal = this.calculateItemsSubtotal(order);
      const discountsTotal = this.roundCurrency(
        Math.min(productsSubtotal, this.calculateDiscountsTotal(order)),
      );
      const baseAfterDiscount = this.roundCurrency(
        Math.max(0, productsSubtotal - discountsTotal),
      );

      const taxes = ((order.taxes as any[]) || []).filter(Boolean);
      const included = taxes.filter((t) => t.isIncluded || t.included);
      const includedAmountSum = included.reduce((sum, t) => {
        const amountField =
          typeof t.amount === 'number' && t.amount > 0 ? t.amount : null;
        const valueField =
          typeof t.value === 'number' && t.value > 0 ? t.value : null;
        // Si value es un monto (distinto al porcentaje), úsalo
        if (
          amountField === null &&
          valueField !== null &&
          !(
            typeof t.percentage === 'number' &&
            Math.abs(valueField - t.percentage) < 0.0001
          )
        ) {
          return this.roundCurrency(sum + valueField);
        }
        if (amountField !== null) {
          return this.roundCurrency(sum + amountField);
        }
        return sum;
      }, 0);

      // Si tenemos porcentajes incluidos, extraer neto por división
      const sumIncludedRate = included.reduce((acc, t) => {
        const pct = typeof t.percentage === 'number' ? t.percentage : null;
        if (pct !== null && pct > 0) return acc + pct / 100;
        return acc;
      }, 0);

      if (sumIncludedRate > 0) {
        subtotal = this.roundCurrency(
          baseAfterDiscount / (1 + sumIncludedRate),
        );
      } else if (includedAmountSum > 0) {
        subtotal = this.roundCurrency(
          Math.max(0, baseAfterDiscount - includedAmountSum),
        );
      } else {
        subtotal = baseAfterDiscount;
      }
    }
    writeLineWithAmount('Subtotal', this.formatCurrency(subtotal));

    if (this.shouldShowDeliveryFee(order)) {
      writeLineWithAmount('Domicilio', this.formatCurrency(this.deliveryFeeAmount(order)));
    }

    // Discounts
    const discountsTotal = this.calculateDiscountsTotal(order);
    if (discountsTotal > 0) {
      writeLineWithAmount(
        'Descuentos',
        `-${this.formatCurrency(discountsTotal)}`,
      );
    }

    // Taxes: NO recalcular. Usar los importes de la orden y el flag isIncluded.
    const taxLines = this.computeTaxLinesFromOrder(order);
    if (taxLines.length > 0) {
      taxLines.forEach((t) => {
        const label = t.included ? `${t.label} (incluido)` : t.label;
        const sign = t.included ? '' : '+';
        writeLineWithAmount(label, `${sign}${this.formatCurrency(t.amount)}`);
      });
    }

    drawDivider();
    writeLineWithAmount(
      'Total a pagar',
      this.formatCurrency(this.orderTotal(order)),
      {
        bold: true,
      },
    );

    // Payments
    if (order.payments && order.payments.length > 0) {
      writeBlock('', {});
      writeBlock('Pagos registrados', { bold: true });
      order.payments.forEach((payment) => {
        const paymentAmount = this.formatCurrency(payment.amount);
        writeLineWithAmount(
          `${payment.method.toUpperCase()} (${this.formatDateTime(
            payment.paidAt,
          )})`,
          paymentAmount,
          { indent: 0 },
        );
      });
    }

    writeBlock('', {});
    writeBlock('Gracias por su preferencia', { align: 'center' });

    // Abrir el PDF en una nueva pestaña (flujo de impresión térmica usado en otros tickets)
    try {
      const sanitized = (
        order.code ||
        (isPublicOrder ? 'publico' : 'mesa') ||
        'ticket'
      )
        .toString()
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `Ticket_Venta_${sanitized}.pdf`;
      this.openPdf(doc, fileName);
    } catch (error) {
      console.error('Error al abrir el PDF del ticket:', error);
      try {
        doc.save('ticket_venta.pdf');
      } catch { }
    }
  }

  private formatDateTime(iso: string): string {
    try {
      const date = new Date(iso);
      return date.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  // Construir líneas de impuesto desde la orden sin recalcular montos.
  private computeTaxLinesFromOrder(order: Order): Array<{
    label: string;
    amount: number;
    included: boolean;
  }> {
    console.log('Computing tax lines from order:', order);
    const taxesRaw: any[] = (order.taxes as any[]) || [];
    if (!taxesRaw.length) return [];
    const netSubtotalFromBackend =
      typeof (order as any).subtotal === 'number'
        ? (order as any).subtotal
        : null;
    const backendTaxesTotal =
      typeof (order as any).taxesTotal === 'number'
        ? (order as any).taxesTotal
        : null;

    return taxesRaw
      .map((tax, idx) => {
        if (!tax) return null;
        const included = !!tax.isIncluded || !!tax.included;
        const pct =
          typeof tax.percentage === 'number' && tax.percentage > 0
            ? tax.percentage
            : typeof tax.value === 'number' && tax.type === 'percentage'
              ? tax.value // value mal usado para porcentaje
              : null;

        const rawAmountField =
          typeof tax.amount === 'number' && tax.amount > 0 ? tax.amount : null; // backend correcto manda 'amount'
        const rawValueField =
          typeof tax.value === 'number' && tax.value > 0 ? tax.value : null; // a veces es monto, a veces porcentaje duplicado

        let amount: number | null = null;

        // Prioridad 1: amount explícito
        if (rawAmountField !== null) amount = rawAmountField;
        // Prioridad 2: si value parece monto (y difiere del porcentaje)
        else if (
          rawValueField !== null &&
          (pct === null || Math.abs(rawValueField - pct) > 0.0001)
        ) {
          amount = rawValueField;
        } else if (pct !== null) {
          // Necesitamos derivar el monto desde porcentaje
          // Caso impuesto incluido: subtotal backend ya es neto => amount = net * pct
          if (included && netSubtotalFromBackend !== null) {
            amount = this.roundCurrency(netSubtotalFromBackend * (pct / 100));
          } else if (!included && netSubtotalFromBackend !== null) {
            // Aditivo: aplicar sobre netSubtotal
            amount = this.roundCurrency(netSubtotalFromBackend * (pct / 100));
          } else if (included && backendTaxesTotal !== null) {
            // fallback: si solo tenemos total de impuestos y un único impuesto incluido
            const includedCount = taxesRaw.filter(
              (t) => !!t && (t.isIncluded || t.included),
            ).length;
            if (includedCount === 1) {
              amount = backendTaxesTotal;
            }
          }
        }

        if (amount === null || !Number.isFinite(amount) || amount <= 0) {
          return null;
        }
        const labelBase =
          (tax.reason && String(tax.reason).trim()) ||
          (pct !== null
            ? `Impuesto (${pct}%)`
            : tax.type
              ? `Impuesto ${tax.type}`
              : `Impuesto ${idx + 1}`);
        return {
          label: labelBase,
          amount: this.roundCurrency(amount),
          included,
        };
      })
      .filter(
        (x): x is { label: string; amount: number; included: boolean } => !!x,
      );
  }

  // Reutiliza el mismo flujo de apertura que mesa/cocina para facilitar impresión directa
  private openPdf(doc: any, fileName: string): void {
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const newWindow = window.open(url);
      if (!newWindow) {
        // Fallback: descargar si el navegador bloquea popups
        doc.save(fileName);
        URL.revokeObjectURL(url);
        return;
      }
      try {
        newWindow.document.title = fileName;
      } catch { }
      const revoke = () => URL.revokeObjectURL(url);
      newWindow.addEventListener('beforeunload', revoke);
      setTimeout(revoke, 60000);
    } catch (error) {
      console.error('Error al abrir el PDF del ticket:', error);
      try {
        doc.save(fileName);
      } catch { }
    }
  }

  getModifiersString(item: any): string {
    if (!item.modifiers || item.modifiers.length === 0) return '';
    // Concatena los nombres de los modificadores separados por coma
    return item.modifiers.map((m: any) => this.modifierLabel(m)).join(', ');
  }
}





