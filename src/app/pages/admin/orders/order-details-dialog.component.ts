import { CommonModule } from '@angular/common';
import {
  Component,
  Inject,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Dialog, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { OrderService } from '../../../core/services/order.service';
import { AppliedTax } from '../../../shared/utils/tax.utils';
import { TaxService, Tax } from '../../../core/services/tax.service';
import { UserService } from '../../../core/services/user.service';
import { BusinessService } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import { TableService } from '../../../core/services/table.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { LocalDateTimePipe } from '../../../shared/pipes/local-datetime.pipe';
import {
  Order,
  OrderDetailsDialogData,
  OrderItem,
  OrderStatusHistoryDto,
  PaymentDto,
  UpdateOrderDto,
} from '../../../core/models/order.model';
import {
  ProductSize,
  ProductSizeService,
} from '../../../core/services/product-size.service';
import { CancelOrderDialogComponent } from '../../../shared/components/cancel-order-dialog/cancel-order-dialog.component';

@Component({
  selector: 'app-order-details-dialog',
  standalone: true,
  imports: [CommonModule, LocalDateTimePipe],
  templateUrl: './order-details-dialog.component.html',
})
export class OrderDetailsDialogComponent implements OnInit {
  private orderService = inject(OrderService);
  private userService = inject(UserService);
  private taxService = inject(TaxService);
  private sizeService = inject(ProductSizeService);
  private businessService = inject(BusinessService);
  private dialog = inject(Dialog);
  private auth = inject(AuthService);
  private tableService = inject(TableService);
  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private taxesConfig = signal<Tax[] | null>(null);
  sizes = signal<ProductSize[]>([]);
  branchName = signal<string | null>(null);

  productsTotals = computed(() => {
    const current = this.order();
    if (!current || !current.items || current.items.length === 0) {
      return {
        quantity: 0,
        unit: 0,
        extras: 0,
        subtotal: 0,
      };
    }

    return current.items.reduce(
      (
        acc,
        item,
      ): {
        quantity: number;
        unit: number;
        extras: number;
        subtotal: number;
      } => {
        const quantity = Math.max(1, item.quantity ?? 1);

        const unitPrice = item.unitPrice ?? 0;
        const extras = (item.modifiers ?? []).reduce((total, mod) => {
          const modQty = Math.max(1, mod.quantity ?? 1);
          const modPrice = mod.additionalPrice ?? 0;
          return total + modPrice * modQty;
        }, 0);
        const rawSubtotal = item.subtotal;
        const computedSubtotal = unitPrice * quantity + extras;
        const itemSubtotal =
          typeof rawSubtotal === 'number' && rawSubtotal > 0
            ? rawSubtotal
            : computedSubtotal;
        console.log('Item subtotal calculation:', {
          item,
          quantity,
          unitPrice,
          extras,
          rawSubtotal,
          computedSubtotal,
          itemSubtotal,
        });
        return {
          quantity: acc.quantity + quantity,
          unit: acc.unit + unitPrice * quantity,
          extras: acc.extras + extras,
          subtotal: acc.subtotal + itemSubtotal,
        };
      },
      { quantity: 0, unit: 0, extras: 0, subtotal: 0 },
    );
  });

  order = signal<Order | null>(null);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  saving = signal<boolean>(false);
  private userNames = signal<Map<string, string>>(new Map());

  constructor(
    private dialogRef: DialogRef<{ cancelled: boolean } | void>,
    @Inject(DIALOG_DATA) private data: OrderDetailsDialogData,
  ) {
    this.mergeUserNames(this.data.userNameFallbacks);
  }

  ngOnInit(): void {
    if (this.data.branchId) {
      this.loadBranchUsers(this.data.branchId);
      this.loadBranchInfo(this.data.branchId);
    }
    // Prefetch taxes config for better display of included vs additive and percentages
    if (this.data.tenantId) {
      this.taxService.getTaxes().subscribe({
        next: (res) => this.taxesConfig.set(res || []),
        error: () => this.taxesConfig.set([]),
      });
      if (this.data.branchId) {
        this.sizeService.getProductSizes().subscribe({
          next: (list) => this.sizes.set(list || []),
          error: () => this.sizes.set([]),
        });
      }
    }
    this.loadOrder();
  }

  private loadBranchInfo(branchId: string) {
    this.businessService.getBranch(branchId).subscribe({
      next: (branch) => this.branchName.set(branch?.name || null),
      error: () => this.branchName.set(null),
    });
  }

  loadOrder() {
    this.loading.set(true);
    this.error.set(null);

    // Load order, items and payments in parallel
    forkJoin({
      order: this.orderService.getOrder(this.data.orderId),
      items: this.orderService
        .listOrderItems(this.data.orderId)
        .pipe(catchError(() => of([]))),
      payments: this.orderService
        .listPayments(this.data.orderId)
        .pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ order, items, payments }) => {
        console.log('Order loaded from API:', order);
        console.log('Items loaded from API:', items);
        console.log('Payments loaded from API:', payments);
        // Map items with computed subtotal (API returns lineTotal, model expects subtotal)
        const mappedItems = (items || []).map((item: any) => {
          const qty = item.quantity || 1;
          const unitPrice = item.unitPrice || 0;
          // Compute subtotal from lineTotal or unitPrice * quantity
          const subtotal = item.subtotal || item.lineTotal || unitPrice * qty;
          return { ...item, subtotal };
        });
        const orderWithItems = {
          ...order,
          items: mappedItems as any,
          payments: payments || [],
        } as Order;
        this.order.set(orderWithItems);
        this.loading.set(false);
        this.mergeUserNames(this.extractUserNamesFromOrder(orderWithItems));
        this.prefetchUsersForOrder(orderWithItems);
      },
      error: (err) => {
        console.error('Error loading order details:', err);
        this.loading.set(false);
        this.error.set(
          err?.error?.message ||
            'No se pudieron cargar los detalles de la orden. Intenta nuevamente.',
        );
      },
    });
  }

  private loadBranchUsers(branchId: string) {
    this.userService.getBranchUsers(branchId).subscribe({
      next: (res) => {
        const fallback = (res || []).reduce(
          (acc: Record<string, string>, entry: any) => {
            const identifier =
              entry?.id ?? entry?._id ?? entry?.userId ?? entry?.uid ?? null;
            if (!identifier) {
              return acc;
            }
            const fullName =
              typeof entry?.fullName === 'string' ? entry.fullName.trim() : '';
            const shortName =
              typeof entry?.name === 'string' ? entry.name.trim() : '';
            const email =
              typeof entry?.email === 'string' ? entry.email.trim() : '';
            const label =
              fullName || shortName || email || String(identifier).trim();
            acc[String(identifier)] = label;
            return acc;
          },
          {},
        );
        this.mergeUserNames(fallback);
      },
      error: (err) => {
        console.error('Error loading users for order dialog:', err);
      },
    });
  }

  private prefetchUsersForOrder(order: Order | null) {
    if (!order?.statusHistory || order.statusHistory.length === 0) {
      return;
    }

    const missing: string[] = [];

    order.statusHistory.forEach((entry) => {
      const actor = entry.changedBy as unknown;
      if (!actor) return;

      if (typeof actor === 'string') {
        const id = actor.trim();
        if (!id) return;
        if (this.userNames().has(id)) return;
        if (this.data.userNameFallbacks?.[id]) return;
        if (!missing.includes(id)) {
          missing.push(id);
        }
        return;
      }

      if (typeof actor === 'object') {
        const record = actor as Record<string, unknown>;
        const identifier =
          (typeof record['id'] === 'string' && record['id']) ||
          (typeof record['_id'] === 'string' && record['_id']) ||
          (typeof record['userId'] === 'string' && record['userId']) ||
          (typeof record['uid'] === 'string' && record['uid']) ||
          null;
        if (!identifier) return;
        const trimmed = identifier.trim();
        if (!trimmed) return;
        if (this.userNames().has(trimmed)) return;
        if (this.data.userNameFallbacks?.[trimmed]) return;
        if (!missing.includes(trimmed)) {
          missing.push(trimmed);
        }
      }
    });

    if (missing.length === 0) {
      return;
    }

    forkJoin(
      missing.map((id: string) =>
        this.userService.getUserById(id).pipe(catchError(() => of(null))),
      ),
    ).subscribe((responses: Array<{ data?: unknown; ok?: boolean } | null>) => {
      const resolved: Record<string, string> = {};

      responses.forEach(
        (response: { data?: unknown; ok?: boolean } | null, index: number) => {
          const id = missing[index];
          if (!response) return;

          const payload =
            (response as { data?: Record<string, unknown>; ok?: boolean })
              ?.data ?? response;
          const label = [
            (payload as { fullName?: string })?.fullName,
            (payload as { name?: string })?.name,
            (payload as { email?: string })?.email,
          ]
            .filter(
              (value) => typeof value === 'string' && value.trim().length > 0,
            )
            .map((value) => (value as string).trim())[0];

          if (label) {
            resolved[id] = label;
          }
        },
      );

      this.mergeUserNames(resolved);
    });
  }

  private mergeUserNames(source?: Record<string, string> | null) {
    if (!source) {
      return;
    }
    const current = new Map(this.userNames());
    Object.entries(source).forEach(([id, name]) => {
      const key = String(id).trim();
      if (!key) return;
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed) return;
      current.set(key, trimmed);
    });
    this.userNames.set(current);
  }

  private extractUserNamesFromOrder(
    order: Order | null,
  ): Record<string, string> {
    if (!order?.statusHistory || order.statusHistory.length === 0) {
      return {};
    }
    const map: Record<string, string> = {};
    order.statusHistory.forEach((entry) => {
      const actor = entry.changedBy as any;
      if (!actor) return;
      if (typeof actor === 'object') {
        const id =
          (typeof actor.id === 'string' && actor.id) ||
          (typeof actor._id === 'string' && actor._id) ||
          (typeof actor.userId === 'string' && actor.userId) ||
          (typeof actor.uid === 'string' && actor.uid) ||
          null;
        if (!id) return;
        const label = [actor.fullName, actor.name, actor.email]
          .filter(
            (value) => typeof value === 'string' && value.trim().length > 0,
          )
          .map((value) => (value as string).trim())[0];
        if (label) {
          map[id] = label;
        }
      }
    });
    return map;
  }

  close() {
    this.dialogRef.close();
  }

  canCancelOrder(order: Order | null): boolean {
    if (!order) {
      return false;
    }
    const status = this.statusCodeFrom(order.status).toLowerCase();
    if (['cancelled', 'closed', 'paid', 'served'].includes(status)) {
      return false;
    }
    const payments = (order.payments || []).filter(
      (payment) => payment.status !== 'voided',
    );
    if (payments.length > 0) {
      return false;
    }
    const roles = (this.auth.getRole() || []).map((role) => role.toUpperCase());
    return roles.some((role) => ['ADMIN', 'SUPER', 'CAJERO'].includes(role));
  }

  cancelOrder(): void {
    const current = this.order();
    if (!current?.id || !this.canCancelOrder(current)) {
      return;
    }

    const ref = this.dialog.open<string>(CancelOrderDialogComponent, {
      width: '480px',
      disableClose: true,
    });

    ref.closed.subscribe((reason) => {
      const text = (reason || '').trim();
      if (text.length < 3) {
        return;
      }

      const tenantId = this.data.tenantId || this.auth.me()?.tenantId || '';
      const branchId = this.data.branchId || current.branchId || '';
      if (!tenantId || !branchId) {
        this.error.set('No se pudo determinar la sucursal de la orden.');
        return;
      }

      const history = current.statusHistory || [];
      const cancellationEntry: OrderStatusHistoryDto = {
        status: { type: 'cancelled' },
        changedAt: new Date().toISOString(),
        changedBy: this.auth.me()?.id || 'System User',
      };

      const dto: UpdateOrderDto = {
        status: { type: 'cancelled' },
        statusHistory: [...history, cancellationEntry],
        notes: this.buildCancellationNotes(current, text),
      };

      this.saving.set(true);
      this.orderService.updateOrder(current.id, dto as any).subscribe({
        next: (res) => {
          this.saving.set(false);
          const updatedOrder = (res as Order | undefined) ?? current;
          this.order.set({
            ...updatedOrder,
            items: updatedOrder.items?.length ? updatedOrder.items : current.items,
            payments:
              updatedOrder.payments?.length !== undefined
                ? updatedOrder.payments
                : current.payments,
          } as Order);

          const tableId = (updatedOrder.tableId ?? current.tableId ?? '').toString();
          if (tableId) {
            this.tableService.updateTableStatus(tenantId, branchId, tableId, 0).subscribe({
              error: (err) =>
                console.warn(
                  'No se pudo actualizar la mesa a Libre tras cancelar la orden.',
                  err,
                ),
            });
          }

          this.dialogRef.close({ cancelled: true });
        },
        error: (err) => {
          console.error('Error cancelling order from details dialog:', err);
          this.saving.set(false);
          this.error.set(
            err?.error?.message || 'No se pudo cancelar la orden.',
          );
        },
      });
    });
  }

  // Show cancellation reason from order.notes field
  cancellationReason(order: Order | null): string {
    if (!order || !order.notes) return '';
    return order.notes.trim();
  }

  isCancelled(order: Order | null): boolean {
    if (!order) return false;
    return this.statusCodeFrom(order.status).toLowerCase() === 'cancelled';
  }

  private estimateItemSubtotal(item: OrderItem | null | undefined): number {
    if (!item) return 0;
    const quantity = Math.max(1, item.quantity ?? 1);
    const unitPrice = (item as { unitPrice?: number }).unitPrice ?? 0;
    const extras = (item.modifiers ?? []).reduce((sum, mod) => {
      const modQty = Math.max(1, (mod as { quantity?: number }).quantity ?? 1);
      const modPrice =
        (mod as { additionalPrice?: number }).additionalPrice ?? 0;
      return sum + modPrice * modQty;
    }, 0);
    return unitPrice * quantity + extras;
  }

  private orderItemsSubtotal(order: Order | null): number {
    if (!order?.items || order.items.length === 0) {
      return 0;
    }
    const subtotal = order.items.reduce((sum, item) => {
      const raw =
        typeof item.subtotal === 'number' && item.subtotal > 0
          ? item.subtotal
          : this.estimateItemSubtotal(item);
      return sum + raw;
    }, 0);
    return this.roundCurrency(subtotal);
  }

  private extractPercentageFromLabel(
    label: string | undefined | null,
  ): number | null {
    if (!label) {
      return null;
    }
    const match = label.match(/(-?\d+(?:\.\d+)?)\s*%/);
    if (!match) {
      return null;
    }
    const value = Number.parseFloat(match[1]);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value;
  }

  private computeTaxDisplaySummary(order: Order | null): {
    applied: Array<{ label: string; amount: number; included: boolean }>;
    includedTotal: number;
    additiveTotal: number;
    taxesTotal: number;
    baseGross: number;
    netSubtotal: number;
  } {
    const applied: Array<{ label: string; amount: number; included: boolean }> =
      [];

    // Build a quick lookup map from config by normalized name
    const configMap = new Map<string, Tax>();
    const cfg = this.taxesConfig();
    if (cfg && cfg.length > 0) {
      cfg.forEach((t) => {
        const key = (t.name || '').trim().toLowerCase();
        if (key) configMap.set(key, t);
      });
    }

    const descriptorByLabel = new Map<
      string,
      {
        label: string;
        included: boolean;
        percentage?: number;
        rawAmount?: number;
      }
    >();

    const productsSubtotal = this.orderItemsSubtotal(order);
    const discountAmount = this.roundCurrency(
      Math.min(productsSubtotal, this.discountsTotal(order!)),
    );
    const taxableBase = this.roundCurrency(
      Math.max(0, productsSubtotal - discountAmount),
    );

    const fallbackApplied = this.data.taxesFallback ?? [];
    fallbackApplied.forEach((tax) => {
      const label = (tax?.label ?? '').trim();
      if (!label) return;
      const key = label.toLowerCase();
      const descriptor = descriptorByLabel.get(key) ?? {
        label,
        included:
          typeof tax?.included === 'boolean'
            ? !!tax.included
            : this.isIncludedLabel(label),
      };
      if (typeof tax?.included === 'boolean') {
        descriptor.included = tax.included;
      }
      if (
        typeof tax?.percentage === 'number' &&
        !Number.isNaN(tax.percentage) &&
        tax.percentage > 0
      ) {
        descriptor.percentage = tax.percentage;
      }
      if (
        typeof tax?.amount === 'number' &&
        !Number.isNaN(tax.amount) &&
        tax.amount > 0
      ) {
        descriptor.rawAmount = tax.amount;
      }
      descriptorByLabel.set(key, descriptor);
    });

    // Process actual taxes from order
    if (order?.taxes && order.taxes.length > 0) {
      order.taxes.forEach((tax, index) => {
        const label = this.normalizeTaxLabel(tax, index).trim();
        if (!label) return;
        const key = label.toLowerCase();
        const descriptor = descriptorByLabel.get(key) ?? {
          label,
          included: this.isIncludedLabel(label),
        };

        // Try to infer from config by matching name
        const nameNoPercentage = label
          .replace(/\s*\(\d+\.?\d*%\)/, '')
          .trim()
          .toLowerCase();
        const taxCfg = configMap.get(nameNoPercentage) || configMap.get(key);
        if (taxCfg) {
          descriptor.included = taxCfg.isIncluded;
          if (taxCfg.percentage > 0) {
            descriptor.percentage = taxCfg.percentage;
          }
        }

        // Prefer explicit percentage from tax.type/value when provided
        if (
          typeof (tax as any).type === 'string' &&
          ((tax as any).type === 'percentage' ||
            (tax as any).type === 'PERCENTAGE') &&
          typeof tax.value === 'number' &&
          !Number.isNaN(tax.value) &&
          tax.value > 0
        ) {
          // Accept either 8 => 8% or 0.08 => 8% (backend may send computed amount)
          // If the tax is type percentage, the value is the *result* of applying the percentage; do not infer % from that
          // We rely on the label or config to get the percentage.
          // Leave raw amount
          descriptor.rawAmount = tax.value;
        }

        // If still not known, try to parse percentage from the label "(8%)"
        if (descriptor.percentage === undefined) {
          const parsed = this.extractPercentageFromLabel(label);
          if (parsed && parsed > 0) {
            descriptor.percentage = parsed;
          }
        }

        // If no percentage set yet and we have a rawAmount already from a percentage-type tax, do not override rawAmount
        if (
          (typeof (tax as any).type !== 'string' ||
            ((tax as any).type !== 'percentage' &&
              (tax as any).type !== 'PERCENTAGE')) &&
          typeof tax.value === 'number' &&
          !Number.isNaN(tax.value) &&
          tax.value > 0 &&
          descriptor.rawAmount === undefined
        ) {
          descriptor.rawAmount = tax.value;
        }

        descriptorByLabel.set(key, descriptor);
      });
    }

    let includedTotal = 0;
    let additiveTotal = 0;

    descriptorByLabel.forEach((descriptor) => {
      const percentage =
        typeof descriptor.percentage === 'number' && descriptor.percentage > 0
          ? descriptor.percentage
          : null;
      let amount = 0;
      if (percentage && taxableBase > 0) {
        amount = this.roundCurrency((taxableBase * percentage) / 100);
      } else if (
        typeof descriptor.rawAmount === 'number' &&
        descriptor.rawAmount > 0
      ) {
        amount = this.roundCurrency(descriptor.rawAmount);
      }
      if (amount <= 0) {
        return;
      }
      const included = !!descriptor.included;
      applied.push({
        label: descriptor.label,
        amount,
        included,
      });
      if (included) {
        includedTotal += amount;
      } else {
        additiveTotal += amount;
      }
    });

    if (applied.length === 0) {
      const fallbackTotal =
        (order &&
          typeof order.taxesTotal === 'number' &&
          order.taxesTotal > 0 &&
          order.taxesTotal) ||
        this.data.taxesTotalFallback ||
        0;
      const roundedFallbackTotal = this.roundCurrency(
        Math.max(0, fallbackTotal),
      );
      if (roundedFallbackTotal > 0) {
        applied.push({
          label: 'Impuestos',
          amount: roundedFallbackTotal,
          included: false,
        });
        additiveTotal += roundedFallbackTotal;
      }
    }

    includedTotal = this.roundCurrency(includedTotal);
    additiveTotal = this.roundCurrency(additiveTotal);

    let taxesTotal = this.roundCurrency(includedTotal + additiveTotal);
    if (taxesTotal <= 0) {
      const fallbackTotal =
        (order &&
          typeof order.taxesTotal === 'number' &&
          order.taxesTotal > 0 &&
          order.taxesTotal) ||
        this.data.taxesTotalFallback ||
        0;
      taxesTotal = this.roundCurrency(Math.max(0, fallbackTotal));
    }

    let netSubtotal = taxableBase;
    if (includedTotal > 0 && netSubtotal > 0) {
      netSubtotal = this.roundCurrency(
        Math.max(0, taxableBase - includedTotal),
      );
    }

    if (netSubtotal <= 0 && order) {
      const explicit =
        typeof order.subtotal === 'number' && order.subtotal > 0
          ? order.subtotal
          : 0;
      if (explicit > 0) {
        netSubtotal = this.roundCurrency(Math.max(0, explicit));
      } else {
        const derived = this.roundCurrency(
          Math.max(0, this.subtotalFromOrder(order) - discountAmount),
        );
        if (derived > 0) {
          netSubtotal = derived;
        }
      }
    }

    if (
      netSubtotal <= 0 &&
      typeof this.data.netSubtotalFallback === 'number' &&
      this.data.netSubtotalFallback > 0
    ) {
      netSubtotal = this.data.netSubtotalFallback;
    }

    if (netSubtotal <= 0) {
      const totalCandidate =
        (order &&
          typeof order.total === 'number' &&
          order.total > 0 &&
          order.total) ||
        (typeof this.data.totalFallback === 'number' &&
        this.data.totalFallback > 0
          ? this.data.totalFallback
          : 0);
      if (totalCandidate > 0) {
        const computedNet = totalCandidate - taxesTotal;
        if (computedNet > 0) {
          netSubtotal = computedNet;
        }
      }
    }

    netSubtotal = this.roundCurrency(Math.max(0, netSubtotal));

    return {
      applied,
      includedTotal,
      additiveTotal,
      taxesTotal,
      baseGross: taxableBase,
      netSubtotal,
    };
  }

  private subtotalFromOrder(order: Order | null): number {
    if (!order) return 0;
    if (typeof order.subtotal === 'number' && order.subtotal > 0) {
      return order.subtotal;
    }
    if (order.items && order.items.length > 0) {
      return order.items.reduce((sum, item) => {
        if (typeof item.subtotal === 'number') {
          return sum + item.subtotal;
        }
        const quantity = Math.max(1, item.quantity ?? 1);
        const unit = (item as { unitPrice?: number }).unitPrice ?? 0;
        return sum + quantity * unit;
      }, 0);
    }
    return 0;
  }

  private statusCodeFrom(
    status: Order['status'] | { type?: Order['status'] } | null | undefined,
  ): string {
    if (status === null || status === undefined) {
      return this.data.statusCode || '';
    }
    if (typeof status === 'string') {
      return status;
    }
    if (typeof status === 'object' && 'type' in status && status.type) {
      return String(status.type);
    }
    return this.data.statusCode || String(status);
  }

  statusLabel(
    status: Order['status'] | { type?: Order['status'] } | null | undefined,
  ): string {
    const code = this.statusCodeFrom(status);
    const label = code
      .toString()
      .toLowerCase()
      .split('-')
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ');
    if (label.trim().length === 0) {
      return this.data.statusLabel || 'Desconocido';
    }
    return label;
  }

  statusBadge(order: Order | null): string {
    const status = this.statusCodeFrom(order?.status).toUpperCase();
    switch (status) {
      case 'CREATED':
        return 'badge-ghost';
      case 'PENDING':
        return 'badge-secondary';
      case 'CONFIRMED':
      case 'PREPARING':
        return 'badge-warning';
      case 'READY':
        return 'badge-info';
      case 'SERVED':
        return 'badge-success';
      case 'PAID':
        return 'badge-primary';
      case 'CLOSED':
        return 'badge-accent';
      case 'CANCELLED':
        return 'badge-error';
      default:
        return 'badge-ghost';
    }
  }

  taxesTotal(order: Order | null): number {
    const summary = this.computeTaxDisplaySummary(order);
    if (summary.taxesTotal > 0) {
      return summary.taxesTotal;
    }
    if (typeof this.data.taxesTotalFallback === 'number') {
      return this.roundCurrency(Math.max(0, this.data.taxesTotalFallback));
    }
    return 0;
  }

  payments(order: Order | null): PaymentDto[] {
    if (!order?.payments) return [];
    return order.payments;
  }

  statusHistory(order: Order | null): OrderStatusHistoryDto[] {
    if (!order?.statusHistory) return [];
    // Filtrar únicamente cambios de estado a nivel de ORDEN (no de items / transiciones internas redundantes)
    const orderLevelStatuses = [
      'created',
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'served',
      'paid',
      'closed',
      'cancelled',
    ];

    const normalized = order.statusHistory
      .map((entry) => ({ ...entry }))
      .filter((entry) => {
        const raw = ((): string => {
          if (!entry.status) return '';
          if (typeof entry.status === 'string') return entry.status;
          if (typeof entry.status === 'object' && 'type' in entry.status) {
            return String((entry.status as any).type || '');
          }
          return String(entry.status || '');
        })();
        const code = raw.toLowerCase();
        return orderLevelStatuses.includes(code);
      })
      .sort((a, b) => {
        const at = new Date(a.changedAt || 0).getTime();
        const bt = new Date(b.changedAt || 0).getTime();
        return at - bt;
      })
      // Eliminar duplicados consecutivos del mismo estado
      .reduce<OrderStatusHistoryDto[]>((acc, curr) => {
        if (acc.length === 0) return [curr];
        const last = acc[acc.length - 1];
        const lastCode = this.statusCodeFrom(last.status).toLowerCase();
        const currCode = this.statusCodeFrom(curr.status).toLowerCase();
        if (lastCode === currCode) {
          return acc; // ignorar duplicado consecutivo
        }
        return [...acc, curr];
      }, []);

    return normalized;
  }

  statusHistoryLabel(entry: OrderStatusHistoryDto): string {
    return this.statusLabel(entry.status);
  }

  changedByLabel(changedBy: OrderStatusHistoryDto['changedBy']): string {
    if (!changedBy) {
      return '—';
    }
    if (typeof changedBy === 'object') {
      const actor = changedBy as Record<string, unknown>;
      const candidate = [actor['fullName'], actor['name'], actor['email']].find(
        (value) =>
          typeof value === 'string' && (value as string).trim().length > 0,
      ) as string | undefined;
      if (candidate) {
        return candidate.trim();
      }
      const identifier =
        (typeof actor['id'] === 'string' && (actor['id'] as string)) ||
        (typeof actor['userId'] === 'string' && (actor['userId'] as string)) ||
        (typeof actor['uid'] === 'string' && (actor['uid'] as string)) ||
        null;
      if (identifier) {
        const fromCache =
          this.userNames().get(identifier) ??
          this.data.userNameFallbacks?.[identifier];
        if (fromCache && fromCache.trim().length > 0) {
          return fromCache.trim();
        }
        return identifier;
      }
    }
    if (typeof changedBy === 'string') {
      const trimmed = changedBy.trim();
      if (trimmed.length === 0) {
        return '—';
      }
      const fallback =
        this.userNames().get(trimmed) ?? this.data.userNameFallbacks?.[trimmed];
      if (fallback && fallback.trim().length > 0) {
        return fallback.trim();
      }
      if (trimmed.toLowerCase() === 'system') {
        return 'Sistema';
      }
      return trimmed;
    }
    return '—';
  }

  private normalizeTaxLabel(
    tax: { reason?: string | null; type?: string | null },
    index: number,
  ): string {
    if (tax.reason && tax.reason.trim().length > 0) {
      return tax.reason;
    }
    if (tax.type) {
      return `Impuesto ${index + 1} (${tax.type})`;
    }
    return `Impuesto ${index + 1}`;
  }

  private isIncludedLabel(label: string | undefined | null): boolean {
    if (!label) return false;
    return label.toLowerCase().includes('incluido');
  }

  assignedTo(order: Order | null): string {
    if (order?.assignedTo && typeof order.assignedTo === 'object') {
      const { fullName, name, email } = order.assignedTo;
      if (fullName) return fullName;
      if (name) return name;
      if (email) return email;
    }
    const assigned = (order as any)?.assignedTo;
    if (typeof assigned === 'string' && assigned.length > 0) {
      return assigned;
    }
    if (this.data.assignedToLabel) {
      return this.data.assignedToLabel;
    }
    if (order?.createdBy) {
      return order.createdBy;
    }
    return 'Sin asignar';
  }

  tableLabel(order: Order | null): string {
    if (!order) {
      return this.data.tableName || '—';
    }
    const table = (order as any).table;
    if (order.tableName) return order.tableName;
    if (table && typeof table === 'object') {
      if (table.name) return table.name;
      if (table.code) return table.code;
      if (table.number !== undefined && table.number !== null) {
        return `Mesa ${table.number}`;
      }
    }
    if (this.data.tableName) return this.data.tableName;
    if (order.tableId) return order.tableId;
    return '—';
  }

  private modifierLabel(mod: any): string {
    if (!mod) return '';
    const candidates = [mod?.modifierName, mod?.name, mod?.title, mod?.label];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    return '';
  }

  private modifierUnitPrice(mod: any): number {
    const candidates = [
      mod?.additionalPrice,
      mod?.price,
      mod?.amount,
      mod?.total,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && !Number.isNaN(candidate)) {
        return candidate;
      }
    }
    return 0;
  }

  private normalizedModifiers(item: OrderItem | null | undefined): Array<{
    trackId: string;
    label: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }> {
    if (!item?.modifiers || item.modifiers.length === 0) {
      return [];
    }

    const modifiers = item.modifiers as Array<any>;
    return modifiers
      .map((raw: any, index: number) => {
        const label = this.modifierLabel(raw);
        if (!label) {
          return null;
        }
        const quantity = Math.max(1, raw?.quantity ?? raw?.portion ?? 1);
        const unitPrice = this.modifierUnitPrice(raw);
        const totalPrice = this.roundCurrency(unitPrice * quantity);
        const trackId =
          (typeof raw?.modifierId === 'string' && raw.modifierId) ||
          (typeof raw?.id === 'string' && raw.id) ||
          `${item?.productId ?? 'mod'}-${index}`;
        return {
          trackId,
          label,
          quantity,
          unitPrice,
          totalPrice,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          trackId: string;
          label: string;
          quantity: number;
          unitPrice: number;
          totalPrice: number;
        } => entry !== null,
      );
  }

  modifierExtras(item: OrderItem | null | undefined): number {
    const total = this.normalizedModifiers(item).reduce(
      (sum, mod) => sum + mod.totalPrice,
      0,
    );
    return this.roundCurrency(total);
  }

  modifiersForDisplay(item: OrderItem | null | undefined): Array<{
    trackId: string;
    label: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }> {
    return this.normalizedModifiers(item);
  }

  unitPriceDisplay(item: OrderItem | null | undefined): number {
    if (!item) return 0;
    const unit = item.unitPrice;
    if (typeof unit === 'number' && unit > 0) {
      return this.roundCurrency(unit);
    }
    const quantity = this.quantityDisplay(item);
    if (quantity <= 0) {
      return 0;
    }
    const subtotal = typeof item.subtotal === 'number' ? item.subtotal : 0;
    const extras = this.modifierExtras(item);
    const baseTotal = subtotal - extras;
    if (baseTotal <= 0) {
      return 0;
    }
    return this.roundCurrency(baseTotal / quantity);
  }

  productLabel(item: OrderItem | null | undefined): string {
    if (!item) return '—';
    if (item.productName && item.productName.trim().length > 0) {
      return item.productName;
    }
    const snapshot: any =
      (item as any).productSnapshot ?? (item as any).snapshot;
    if (snapshot) {
      if (typeof snapshot === 'string' && snapshot.trim().length > 0) {
        return snapshot;
      }
      if (snapshot.name && snapshot.name.trim().length > 0) {
        return snapshot.name;
      }
      if (snapshot.title && snapshot.title.trim().length > 0) {
        return snapshot.title;
      }
    }
    const product: any = (item as any).product;
    if (product) {
      if (typeof product === 'string') return product;
      if (product.name) return product.name;
      if (product.code) return product.code;
      if (product.title) return product.title;
    }
    const fallback = item.productId
      ? this.data.productNameFallbacks?.[item.productId]
      : undefined;
    if (fallback && fallback.trim().length > 0) {
      return fallback;
    }
    if (item.productId) return item.productId;
    return '—';
  }

  // Extract size label from product name or notes when available
  sizeBadgeLabel(item: OrderItem | null | undefined): string | null {
    if (!item) return null;
    const sizeId = (item as any).sizeId as string | undefined;
    if (sizeId) {
      const sz = this.sizes().find((s) => s.id === sizeId);
      if (sz?.name) return sz.name;
    }
    const textSources: string[] = [];
    const directName = (item as any).productName as string | undefined;
    if (typeof directName === 'string' && directName.trim().length > 0) {
      textSources.push(directName);
    }
    const notes = (item as any).notes as string | undefined;
    if (typeof notes === 'string' && notes.trim().length > 0) {
      textSources.push(notes);
    }

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

  quantityDisplay(item: OrderItem | null | undefined): number {
    if (!item) return 0;
    if (typeof item.quantity === 'number' && item.quantity > 0) {
      return item.quantity;
    }
    return 1;
  }

  // 1. Calcular Subtotal (Suma de items)
  subtotalDisplay(order: Order): number {
    // Use backend subtotal if available
    if (typeof order.subtotal === 'number' && order.subtotal > 0) {
      return order.subtotal;
    }
    // Otherwise calculate from items
    return order.items.reduce((acc, item) => acc + (item.subtotal || 0), 0);
  }

  deliveryFeeDisplay(order: Order): number {
    const fee = order.delivery?.fee;
    return typeof fee === 'number' && Number.isFinite(fee) ? Math.max(0, fee) : 0;
  }

  showDeliveryFee(order: Order): boolean {
    return !!(order.requiresDelivery || order.delivery?.requiresDelivery || !order.isTakeaway || this.deliveryFeeDisplay(order) > 0);
  }

  private buildCancellationNotes(order: Order, reason: string): string {
    const prefix = 'Motivo de cancelacion:';
    const note = `${prefix} ${reason.trim()}`;
    const existing = (order.notes || '').trim();
    if (!existing) {
      return note;
    }
    return `${existing}\n${note}`;
  }

  // 2. Calcular Descuentos Totales
  discountsTotal(order: Order): number {
    if (!order.discounts) return 0;
    return order.discounts.reduce((acc, d) => acc + d.value, 0);
  }

  // 3. Calcular Impuestos (Retorna array para mostrar detalle y suma)
  appliedTaxes(
    order: Order,
  ): { label: string; amount: number; included: boolean }[] {
    // Aquí iría tu lógica real de impuestos.
    // Ejemplo simplificado si tus items ya tienen impuestos calculados o si es global:
    // Si no tienes lógica compleja aún, puedes retornar vacío []
    return [];
  }

  // 4. Calcular TOTAL FINAL
  totalDisplay(order: Order): number {
    // Use backend total if available and valid
    if (typeof order.total === 'number' && order.total > 0) {
      return order.total;
    }
    // Otherwise calculate from items
    const sub = this.subtotalDisplay(order);
    const disc = this.discountsTotal(order);
    const deliveryFee = this.deliveryFeeDisplay(order);
    // const taxes = ... (sumar impuestos si no están incluidos)
    return sub - disc + deliveryFee;
  }

  // 5. Calcular LO PAGADO (Suma de pagos registrados)
  paymentsTotal(order: Order): number {
    if (!order.payments) return 0;
    return order.payments.reduce((acc, pay) => acc + pay.amount, 0);
  }

  // 6. Calcular PENDIENTE (Deuda actual)
  outstanding(order: Order): number {
    const total = this.totalDisplay(order);
    const paid = this.paymentsTotal(order);
    // Retorna 0 si ya pagó de más o está completo, sino la diferencia
    return Math.max(0, total - paid);
  }

  // --- FORMATO ---

  // Helper simple para moneda si no usas el pipe directamente en todos lados
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value);
  }
}

