import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { AuthService } from '../../../core/services/auth.service';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import {
  BusinessService,
  BranchSummary,
} from '../../../core/services/business.service';
import { OrderService } from '../../../core/services/order.service';
import { OrderDetailsDialogComponent } from './order-details-dialog.component';
import { TableService } from '../../../core/services/table.service';
import { CancelOrderDialogComponent } from '../../../shared/components/cancel-order-dialog/cancel-order-dialog.component';
import { Tax, TaxService } from '../../../core/services/tax.service';
import { AppliedTaxSummary } from '../../../shared/utils/tax.utils';
import {
  Product,
  ProductService,
} from '../../../core/services/product.service';
import { UserService } from '../../../core/services/user.service';
import { LocalDateTimePipe } from '../../../shared/pipes/local-datetime.pipe';
import { todayAsInputLocalDate } from '../../../shared/utils/date-range.utils';
import * as XLSX from 'xlsx';
import {
  Order,
  OrderStatusHistoryDto,
  UpdateOrderDto,
} from '../../../core/models/order.model';

@Component({
  selector: 'app-order-history',
  standalone: true,
  imports: [CommonModule, FormsModule, LocalDateTimePipe],
  templateUrl: './order-history.component.html',
})
export class OrderHistoryComponent implements OnInit {
  private auth = inject(AuthService);
  private businessService = inject(BusinessService);
  private orderService = inject(OrderService);
  private dialog = inject(Dialog);
  private tableService = inject(TableService);
  private taxService = inject(TaxService);
  private productService = inject(ProductService);
  private userService = inject(UserService);
  private branchSelectionService = inject(BranchSelectionService);

  readonly maxDate = todayAsInputLocalDate();
  tenantId = signal<string>('');
  branches = signal<BranchSummary[]>([]);
  startDate = signal<string>(this.maxDate);
  endDate = signal<string>(this.maxDate);
  orders = signal<Order[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  userRoles = signal<string[]>([]);
  isAdmin = signal<boolean>(false);
  tablesById = signal<Map<string, string>>(new Map());
  taxes = signal<Tax[]>([]);
  productsById = signal<Map<string, string>>(new Map());
  usersById = signal<Map<string, string>>(new Map());

  constructor() {
    // Effect para reaccionar a cambios en la selección de sucursal o fecha
    effect(() => {
      const branchId = this.branchSelectionService.selectedBranchId();
      const from = this.startDate();
      const to = this.endDate();
      if (branchId && this.tenantId()) {
        this.loadTablesForBranch(branchId);
        this.loadProductsForBranch(branchId);
        this.loadUsersForBranch(branchId);
        this.loadOrders();
      }
    });
  }

  ngOnInit(): void {
    const user = this.auth.me();
    this.tenantId.set(user?.tenantId || '');
    this.userRoles.set(this.auth.getRole() || []);

    const hasAdminRole = this.userRoles().some((role) =>
      ['Admin', 'Super'].includes(role),
    );
    this.isAdmin.set(hasAdminRole);

    if (this.tenantId()) {
      this.loadTenantTaxes(this.tenantId());
      this.loadBranches();
    }
    // No need to start SSE or subscribe to events here; OrdersLiveStore handles it
  }

  private loadTenantTaxes(tenantId: string) {
    this.taxService.getTaxes().subscribe({
      next: (res) => {
        const active = (res || []).filter((tax) => tax.isActive);
        this.taxes.set(active);
        const branchId = this.branchSelectionService.selectedBranchId();
        if (branchId) {
          this.loadOrders();
        }
      },
      error: (err) => {
        console.error('Error loading taxes for order history view:', err);
      },
    });
  }

  private loadBranches() {
    this.businessService.getBranches().subscribe((res) => {
      this.branches.set(res || []);
    });
  }

  onDateChange(which: 'start' | 'end', date: string) {
    if (which === 'start') {
      this.startDate.set(date);
      // Si la fecha de inicio es mayor que la de fin, ajustar
      if (date > this.endDate()) {
        this.endDate.set(date);
      }
    } else {
      this.endDate.set(date);
      // Si la fecha de fin es menor que la de inicio, ajustar
      if (date < this.startDate()) {
        this.startDate.set(date);
      }
    }
  }

  refresh() {
    this.loadOrders();
  }

  private loadOrders() {
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (!this.tenantId() || !branchId || !this.startDate() || !this.endDate()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    // Usar los nuevos parámetros from/to con fecha simple (YYYY-MM-DD)
    this.orderService
      .listOrders({
        branchId,
        from: this.startDate(),
        to: this.endDate(),
      })
      .subscribe({
        next: (res) => {
          this.orders.set(res || []);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Error loading order history:', err);
          this.loading.set(false);
          this.error.set(
            err?.error?.message ||
              'No se pudieron cargar las órdenes. Intenta nuevamente.',
          );
        },
      });
  }

  private loadTablesForBranch(branchId: string) {
    if (!this.tenantId() || !branchId) {
      return;
    }

    this.tableService.getTables(branchId).subscribe({
      next: (res) => {
        const entries = (res || []).map(
          (table) => [table.id, table.name || 'Mesa'] as [string, string],
        );
        this.tablesById.set(new Map(entries));
      },
      error: (err) => {
        console.error('Error loading tables for order history view:', err);
        this.tablesById.set(new Map());
      },
    });
  }

  private loadProductsForBranch(branchId: string) {
    if (!this.tenantId() || !branchId) {
      this.productsById.set(new Map());
      return;
    }

    this.productService.getProducts().subscribe({
      next: (res) => {
        const entries = (res || []).map(
          (product: Product) => [product.id, product.name] as [string, string],
        );
        this.productsById.set(new Map(entries));
      },
      error: (err) => {
        console.error('Error loading products for order history view:', err);
        this.productsById.set(new Map());
      },
    });
  }

  private loadUsersForBranch(branchId: string) {
    if (!branchId) {
      this.usersById.set(new Map());
      return;
    }

    this.userService.getBranchUsers(branchId).subscribe({
      next: (res) => {
        const entries = (res || []).map((user: any) => {
          const identifier =
            user?.id ?? user?._id ?? user?.userId ?? user?.uid ?? null;
          if (!identifier) {
            return null;
          }
          const fullName =
            typeof user?.fullName === 'string' ? user.fullName.trim() : '';
          const shortName =
            typeof user?.name === 'string' ? user.name.trim() : '';
          const email =
            typeof user?.email === 'string' ? user.email.trim() : '';
          const display =
            fullName || shortName || email || String(identifier).trim();
          return [String(identifier).toLowerCase(), display] as [
            string,
            string,
          ];
        });
        this.usersById.set(
          new Map(
            entries.filter((entry): entry is [string, string] => !!entry),
          ),
        );
      },
      error: (err) => {
        console.error('Error loading users for order history view:', err);
        this.usersById.set(new Map());
      },
    });
  }

  private getOrderStatusCode(order: Order): string {
    const raw = order.status as any;
    if (!raw) return '';
    if (typeof raw === 'string') return raw.toLowerCase();
    if (typeof raw === 'object' && 'type' in raw && raw?.type) {
      return String(raw.type).toLowerCase();
    }
    return '';
  }

  openDetails(order: Order) {
    if (!order?.id) return;
    const taxSummary = this.computeTaxesFromConfig(order);
    const computedNetSubtotal =
      taxSummary.netSubtotal > 0
        ? taxSummary.netSubtotal
        : this.roundCurrency(
            Math.max(
              0,
              this.orderSubtotalFromOrder(order) - this.discountsTotal(order),
            ),
          );
    const computedTaxes = this.roundCurrency(
      taxSummary.additiveTotal + taxSummary.includedTotal,
    );
    const computedTotal = this.roundCurrency(
      computedNetSubtotal + taxSummary.includedTotal + taxSummary.additiveTotal,
    );

    const ref = this.dialog.open(OrderDetailsDialogComponent, {
      width: '760px',
      maxHeight: '90vh',
      data: {
        orderId: order.id,
        tenantId: this.tenantId(),
        branchId: this.branchSelectionService.getEffectiveBranchId(),
        tableName: this.tableLabel(order),
        assignedToLabel: this.assignedTo(order),
        statusCode: this.getOrderStatusCode(order),
        statusLabel: this.orderStatusLabel(order),
        taxesFallback: taxSummary.applied,
        taxesTotalFallback: computedTaxes,
        netSubtotalFallback: computedNetSubtotal,
        totalFallback: computedTotal,
        productNameFallbacks: Object.fromEntries(this.productsById()),
        userNameFallbacks: Object.fromEntries(this.usersById()),
      },
    });
    ref.closed.subscribe((result) => {
      if (result && typeof result === 'object' && 'cancelled' in result) {
        this.loadOrders();
      }
    });
  }

  canCancelOrder(order: Order): boolean {
    const status = this.getOrderStatusCode(order);
    if (['cancelled', 'closed', 'paid', 'served'].includes(status)) {
      return false;
    }
    const payments = (order.payments || []).filter(
      (payment) => payment.status !== 'voided',
    );
    if (payments.length > 0) {
      return false;
    }
    const roles = this.userRoles().map((role) => role.toUpperCase());
    return roles.some((role) => ['ADMIN', 'SUPER', 'CAJERO'].includes(role));
  }

  cancelOrder(order: Order): void {
    if (!order?.id || !this.canCancelOrder(order)) {
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

      const branchId = this.branchSelectionService.getEffectiveBranchId();
      if (!branchId || !this.tenantId()) {
        this.error.set('No se pudo determinar la sucursal activa.');
        return;
      }

      const changedBy = this.auth.me()?.id || 'System User';
      const history = order.statusHistory || [];
      const cancellationEntry: OrderStatusHistoryDto = {
        status: { type: 'cancelled' },
        changedAt: new Date().toISOString(),
        changedBy,
      };

      const dto: UpdateOrderDto = {
        status: { type: 'cancelled' },
        statusHistory: [...history, cancellationEntry],
        notes: this.buildCancellationNotes(order, text),
      };

      this.loading.set(true);
      this.orderService.updateOrder(order.id, dto as any).subscribe({
        next: (res) => {
          this.loading.set(false);
          const updatedOrder = (res as Order) ?? null;
          const tableId = (updatedOrder?.tableId ?? order.tableId ?? '').toString();

          if (tableId) {
            this.tableService
              .updateTableStatus(this.tenantId(), branchId, tableId, 0)
              .subscribe({
                error: (err) =>
                  console.warn(
                    'No se pudo actualizar la mesa a Libre tras cancelar la orden.',
                    err,
                  ),
              });
          }

          this.loadOrders();
        },
        error: (err) => {
          console.error('Error cancelling order from admin history:', err);
          this.loading.set(false);
          this.error.set(
            err?.error?.message || 'No se pudo cancelar la orden.',
          );
        },
      });
    });
  }

  formatCurrency(value: number | undefined | null): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 2,
    }).format(value ?? 0);
  }

  orderStatusBadge(order: Order): string {
    const status = this.getOrderStatusCode(order).toUpperCase();
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

  orderStatusLabel(order: Order): string {
    const status = this.getOrderStatusCode(order);
    return status
      .split('-')
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ');
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
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

  private estimateItemSubtotal(item: Order['items'][number]): number {
    if (!item) {
      return 0;
    }
    const quantity = Math.max(
      1,
      (item as { quantity?: number; qty?: number }).quantity ??
        (item as { qty?: number }).qty ??
        1,
    );
    const unitPrice = (item as { unitPrice?: number }).unitPrice ?? 0;
    const extras = (item.modifiers ?? []).reduce((sum, mod) => {
      const modQty = Math.max(
        1,
        (mod as { quantity?: number }).quantity ??
          (mod as { portion?: number }).portion ??
          1,
      );
      const modPrice =
        (mod as { additionalPrice?: number }).additionalPrice ?? 0;
      return sum + modPrice * modQty;
    }, 0);
    return this.roundCurrency(unitPrice * quantity + extras);
  }

  private orderGrossSubtotal(order: Order): number {
    if (!order?.items || order.items.length === 0) {
      if (typeof order.subtotal === 'number' && order.subtotal > 0) {
        return this.roundCurrency(order.subtotal);
      }
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

  private buildTaxLabel(tax: Tax): string {
    return `${tax.name} (${tax.percentage}%)`;
  }

  private orderSubtotalFromOrder(order: Order): number {
    const gross = this.orderGrossSubtotal(order);
    if (gross > 0) {
      return gross;
    }
    if (typeof order.subtotal === 'number' && order.subtotal > 0) {
      return this.roundCurrency(order.subtotal);
    }
    return 0;
  }

  private computeTaxesFromConfig(order: Order): AppliedTaxSummary {
    const taxesConfig = this.taxes();
    const grossSubtotal = this.orderGrossSubtotal(order);
    const totalDiscounts = this.roundCurrency(
      Math.min(grossSubtotal, this.discountsTotal(order)),
    );
    const taxableBase = this.roundCurrency(
      Math.max(0, grossSubtotal - totalDiscounts),
    );

    const appliedLabelSet = new Set(
      (order.taxes || [])
        .map((tax) => (tax.reason ?? '').trim().toLowerCase())
        .filter((reason) => reason.length > 0),
    );

    const relevantTaxes = taxesConfig.filter((tax) => {
      if (appliedLabelSet.size === 0) {
        return true;
      }
      const label = this.buildTaxLabel(tax).toLowerCase();
      return appliedLabelSet.has(label);
    });

    if (taxableBase <= 0 || relevantTaxes.length === 0) {
      return {
        applied: [],
        total: 0,
        additiveTotal: 0,
        includedTotal: 0,
        baseGross: taxableBase,
        netSubtotal: taxableBase,
      };
    }

    let includedTotal = 0;
    let additiveTotal = 0;

    const applied = relevantTaxes.map((tax) => {
      const amount = this.roundCurrency(
        taxableBase * (Math.max(0, tax.percentage) / 100),
      );
      if (tax.isIncluded) {
        includedTotal += amount;
      } else {
        additiveTotal += amount;
      }
      return {
        id: tax.id,
        label: this.buildTaxLabel(tax),
        amount,
        included: tax.isIncluded,
        percentage: tax.percentage,
      };
    });

    includedTotal = this.roundCurrency(includedTotal);
    additiveTotal = this.roundCurrency(additiveTotal);
    const total = this.roundCurrency(includedTotal + additiveTotal);
    const netSubtotal = this.roundCurrency(
      includedTotal > 0 ? taxableBase - includedTotal : taxableBase,
    );

    return {
      applied,
      total,
      additiveTotal,
      includedTotal,
      baseGross: taxableBase,
      netSubtotal,
    };
  }

  orderSubtotalAmount(order: Order): number {
    const summary = this.computeTaxesFromConfig(order);
    if (summary.netSubtotal > 0) {
      return summary.netSubtotal;
    }
    const fallback = Math.max(
      0,
      this.orderSubtotalFromOrder(order) - this.discountsTotal(order),
    );
    return this.roundCurrency(fallback);
  }

  orderTotalAmount(order: Order): number {
    const summary = this.computeTaxesFromConfig(order);
    const net = summary.netSubtotal;
    if (net <= 0) {
      const fallbackSubtotal = Math.max(
        0,
        this.orderSubtotalFromOrder(order) - this.discountsTotal(order),
      );
      return this.roundCurrency(
        fallbackSubtotal + summary.includedTotal + summary.additiveTotal,
      );
    }
    return this.roundCurrency(
      net + summary.includedTotal + summary.additiveTotal,
    );
  }

  taxesTotal(order: Order): number {
    const summary = this.computeTaxesFromConfig(order);
    const computed = this.roundCurrency(
      summary.additiveTotal + summary.includedTotal,
    );
    if (computed > 0) {
      return computed;
    }
    if (
      typeof order.taxesTotal === 'number' &&
      !Number.isNaN(order.taxesTotal)
    ) {
      return order.taxesTotal;
    }
    const fromOrder = (order.taxes || []).reduce(
      (sum, tax) => sum + (tax.value || 0),
      0,
    );
    if (fromOrder > 0) {
      return this.roundCurrency(fromOrder);
    }
    return 0;
  }

  discountsTotal(order: Order): number {
    if (typeof order.discountsTotal === 'number') {
      return order.discountsTotal;
    }
    const discounts = order.discounts || [];
    return discounts.reduce((sum, discount) => sum + (discount.value || 0), 0);
  }

  assignedTo(order: Order): string {
    const assigned = order.assignedToUserId || (order.assignedTo as any);

    if (assigned && typeof assigned === 'object') {
      const { fullName, name, email } = assigned as {
        fullName?: string;
        name?: string;
        email?: string;
      };
      if (fullName) return fullName;
      if (name) return name;
      if (email) return email;
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

  tableLabel(order: Order): string {
    const map = this.tablesById();
    if (map.has(order.tableId)) {
      return map.get(order.tableId) as string;
    }
    return order.tableName || 'Domicilio' || '—';
  }

  // ===== Export helpers =====
  private escapeCsv(value: any): string {
    if (value === null || value === undefined) return '""';
    const str = String(value);
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private downloadCsv(filename: string, headers: string[], rows: string[][]) {
    const headerLine = headers.map((h) => this.escapeCsv(h)).join(',');
    const bodyLines = rows
      .map((r) => r.map((v) => this.escapeCsv(v)).join(','))
      .join('\n');
    const csv = `${headerLine}\n${bodyLines}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private formatDateLocal(value: string | Date | undefined | null): string {
    if (!value) return '';
    const d = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    return `${pad(d.getDate())}/${pad(
      d.getMonth() + 1,
    )}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  exportOrdersCsv() {
    const list = this.orders();
    const headers = [
      'Orden',
      'Mesa',
      'Estado',
      'Asignado',
      'Subtotal',
      'Impuestos',
      'Descuentos',
      'Total',
      'Actualización',
    ];
    const rows = (list || []).map((order) => [
      String(order.code ?? ''),
      this.tableLabel(order),
      this.orderStatusLabel(order),
      this.assignedTo(order),
      (this.orderSubtotalAmount(order) ?? 0).toFixed(2),
      (this.taxesTotal(order) ?? 0).toFixed(2),
      (this.discountsTotal(order) ?? 0).toFixed(2),
      (this.orderTotalAmount(order) ?? 0).toFixed(2),
      this.formatDateLocal(order.updatedAt || order.createdAt),
    ]);
    this.downloadCsv('ordenes.csv', headers, rows);
  }

  // Excel helpers
  private excelDateSerial(d: Date): number {
    const epoch = Date.UTC(1899, 11, 30);
    return (d.getTime() - epoch) / (24 * 60 * 60 * 1000);
  }

  private applyExcelFormats(
    ws: XLSX.WorkSheet,
    opts: { dateColIndex: number; currencyColIndexes: number[] },
  ) {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      // Date
      const dAddr = XLSX.utils.encode_cell({ c: opts.dateColIndex, r });
      const dCell = ws[dAddr];
      if (dCell && dCell.v) {
        const d = new Date(dCell.v);
        if (!isNaN(d.getTime())) {
          ws[dAddr] = {
            t: 'n',
            v: this.excelDateSerial(d),
            z: 'dd/mm/yyyy hh:mm',
          } as any;
        }
      }
      // Currency columns
      for (const c of opts.currencyColIndexes) {
        const cAddr = XLSX.utils.encode_cell({ c, r });
        const cCell = ws[cAddr];
        if (cCell) {
          const num =
            typeof cCell.v === 'number' ? cCell.v : parseFloat(cCell.v || '0');
          ws[cAddr] = {
            t: 'n',
            v: isNaN(num) ? 0 : num,
            z: '"$"#,##0.00',
          } as any;
        }
      }
    }
  }

  exportOrdersExcel() {
    const list = this.orders();
    const headers = [
      'Orden',
      'Mesa',
      'Estado',
      'Asignado',
      'Subtotal',
      'Impuestos',
      'Descuentos',
      'Total',
      'Actualización',
    ];
    const rows = (list || []).map((order) => [
      order.code ?? '',
      this.tableLabel(order),
      this.orderStatusLabel(order),
      this.assignedTo(order),
      this.orderSubtotalAmount(order) ?? 0,
      this.taxesTotal(order) ?? 0,
      this.discountsTotal(order) ?? 0,
      this.orderTotalAmount(order) ?? 0,
      order.updatedAt
        ? new Date(order.updatedAt)
        : order.createdAt
          ? new Date(order.createdAt)
          : '',
    ]);
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    this.applyExcelFormats(worksheet, {
      dateColIndex: 8,
      currencyColIndexes: [4, 5, 6, 7],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Órdenes');
    XLSX.writeFile(workbook, 'ordenes.xlsx');
  }
}
