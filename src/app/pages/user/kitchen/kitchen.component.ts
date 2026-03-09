import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import {
  BusinessService,
  BranchSummary,
  BusinessDetail,
} from '../../../core/services/business.service';
import { OrderService } from '../../../core/services/order.service';
import { TableService } from '../../../core/services/table.service';
import {
  ProductService,
  Product,
} from '../../../core/services/product.service';
import { jsPDF } from 'jspdf';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../core/models/user.model';

type OrderItemWithKey = Order['items'][number];

type StatusOption = {
  value: OrderItemStatusType;
  label: string;
};

import { Order, OrderItemStatusType } from '../../../core/models/order.model';
import { ProductSizeService } from '../../../core/services/product-size.service';
import { OrdersLiveStore } from '../../../core/services/orders-live-store.service';
import { Size } from '../../../shared/services/size.service';

@Component({
  selector: 'app-user-kitchen',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './kitchen.component.html',
})
export class UserKitchenComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private businessService = inject(BusinessService);
  private orderService = inject(OrderService);
  private tableService = inject(TableService);
  private productService = inject(ProductService);
  private productSizeService = inject(ProductSizeService);
  private userService = inject(UserService);
  private ordersStore = inject(OrdersLiveStore);

  tenantId = signal<string>('');
  branches = signal<BranchSummary[]>([]);
  kitchenOrders = signal<Order[]>([]);
  private branchSelection = inject(BranchSelectionService);
  private isAdminUser = signal<boolean>(false);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  tablesById = signal<Map<string, string>>(new Map());
  usersById = signal<Map<string, string>>(new Map());
  productsById = signal<Map<string, string>>(new Map());
  subcategoryByProductId = signal<Map<string, string>>(new Map());
  sizes = signal<Size[]>([]);
  updatingItemKeys = signal<Set<string>>(new Set());
  businessDetail = signal<BusinessDetail | null>(null);
  localTime = signal<string>(
    new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
  );
  readonly statusOptions: StatusOption[] = [
    { value: 'pending', label: 'Pendiente' },
    { value: 'preparing', label: 'Preparando' },
    { value: 'ready', label: 'Listo' },
    { value: 'served', label: 'Servido' },
  ];

  readonly hasKitchenOrders = computed(() => this.kitchenOrders().length > 0);

  constructor() {
    effect(() => {
      const branchId = this.branchSelection.getEffectiveBranchId();
      const ready = this.ordersStore.ready();
      const liveOrders = this.ordersStore.ordersList();

      if (!branchId || !ready) {
        return;
      }

      const relevant = liveOrders
        .filter((order) => order.branchId === branchId)
        .filter((order) => this.shouldKeepOrderForKitchen(order));
      relevant.sort((a, b) => this.compareOrders(a, b));
      this.kitchenOrders.set(relevant);
      this.loading.set(false);
      this.error.set(null);
    });
  }

  ngOnInit(): void {
    this.startClock();
    const user = this.auth.me();
    this.tenantId.set(user?.tenantId || '');

    if (!this.tenantId()) {
      this.error.set('No se encontró el tenant actual.');
      return;
    }

    const roles = this.auth.getRole() || [];
    this.isAdminUser.set(roles.some((r) => ['Admin', 'Super'].includes(r)));

    this.loadBusinessInfo();
    this.initializeBranchContext();
  }

  ngOnDestroy(): void {
    // Cleanup si es necesario en el futuro
    if (this.clockIntervalId) {
      clearInterval(this.clockIntervalId);
      this.clockIntervalId = null;
    }
  }

  private clockIntervalId: ReturnType<typeof setInterval> | null = null;

  private startClock(): void {
    this.localTime.set(
      new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    );

    this.clockIntervalId = setInterval(() => {
      this.localTime.set(
        new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      );
    }, 1000);
  }

  printKitchenTicket(order: Order): void {
    const items = order.items || [];
    if (items.length === 0) {
      console.warn('No hay productos en la orden para generar el ticket.');
      return;
    }

    const doc = new jsPDF({ unit: 'mm', format: [80, 297] });
    const margin = 6;
    const defaultLineHeight = 4.5;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    let cursorY = margin;

    const baseFontSize = 9;
    doc.setFontSize(baseFontSize);

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
        doc.addPage([80, 297]);
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
        if (line === undefined || line === null) {
          continue;
        }
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

    const drawDivider = () => {
      ensureSpace(1, 3);
      doc.setDrawColor(180);
      doc.setLineWidth(0.1);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      doc.setDrawColor(0);
      cursorY += 6;
    };

    const formatCurrency = (value: number): string => {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    };

    const writeLineWithAmount = (label: string, amount: string) => {
      ensureSpace(1, defaultLineHeight);
      const availableWidth = contentWidth - 2;
      const labelMaxWidth = availableWidth - 20;
      const splitted = doc.splitTextToSize(label, labelMaxWidth);
      if (splitted.length === 1) {
        doc.text(splitted[0], margin, cursorY, { align: 'left' });
        doc.text(amount, pageWidth - margin, cursorY, { align: 'right' });
        cursorY += defaultLineHeight;
      } else {
        for (let i = 0; i < splitted.length; i++) {
          ensureSpace(1, defaultLineHeight);
          doc.text(splitted[i], margin, cursorY, { align: 'left' });
          if (i === splitted.length - 1) {
            doc.text(amount, pageWidth - margin, cursorY, { align: 'right' });
          }
          cursorY += defaultLineHeight;
        }
      }
    };

    const branch = this.resolveBranchForOrder(order);
    const isPublicOrder = order.source === 'public-menu';
    const orderTimestamp = order.createdAt
      ? new Date(order.createdAt)
      : new Date();

    addLogo();

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    writeBlock(branch?.name || 'Ticket', { align: 'center' });

    doc.setFontSize(baseFontSize);
    doc.setFont('helvetica', 'normal');
    if (branch?.address) {
      writeBlock(branch.address, { align: 'center' });
    }

    writeBlock(
      `Fecha: ${orderTimestamp.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`,
      { align: 'center' },
    );

    if (order.code) {
      writeBlock(`Orden: ${order.code}`, { align: 'center' });
    }

    drawDivider();

    // Customer info for public orders
    if (isPublicOrder && (order as any).customer) {
      const customer = (order as any).customer;
      writeBlock('Datos del Cliente', { bold: true, align: 'center' });
      writeBlock(`Nombre: ${customer.name}`, {});
      writeBlock(`Teléfono: ${customer.phone}`, {});
      if (customer.address) {
        writeBlock(`Dirección: ${customer.address}`, {});
      }
      if ((order as any).isTakeaway === false) {
        writeBlock('Tipo: Entrega a domicilio', { bold: true });
      } else {
        writeBlock('Tipo: Para llevar', { bold: true });
      }
    } else {
      const tableLabel = this.tableLabel(order);
      writeBlock(`Mesa: ${tableLabel}`, { bold: true, align: 'center' });
    }

    drawDivider();

    // Products detail
    doc.setFontSize(baseFontSize);
    doc.setFont('helvetica', 'bold');
    writeLineWithAmount('Detalle', 'Total');
    doc.setFont('helvetica', 'normal');

    items.forEach((item) => {
      const quantity = this.resolveQuantity(item);
      const name = this.productLabel(item);
      const lineLabel = `${quantity} x ${name}`;
      const itemTotal = formatCurrency(item.subtotal!);
      writeLineWithAmount(lineLabel, itemTotal);

      if (item.modifiers && item.modifiers.length > 0) {
        item.modifiers.forEach((modifier) => {
          const modName =
            (modifier as any).name || (modifier as any).modifierName || '';
          const modParts = [
            (modName || '').trim() || `Mod ${modifier.modifierId}`,
          ];
          if (modifier.quantity && modifier.quantity > 1) {
            modParts.push(`x${modifier.quantity}`);
          }
          if ((modifier as any).price && (modifier as any).price > 0) {
            modParts.push(`+${formatCurrency((modifier as any).price)}`);
          }
          writeBlock(`- ${modParts.join(' ')}`, { indent: 4 });
        });
      }

      const notes = (item.notes || '').toString().trim();
      if (notes.length > 0) {
        writeBlock(`${notes}`, { indent: 4 }); //actualmete esta mosrtando la categgoria
      }
    });

    drawDivider();

    // Calculate and show totals using the same logic as orders.component
    const subtotal = this.roundCurrency(
      items.reduce((sum, item) => sum + (item.subtotal || 0), 0),
    );

    const taxLines = this.computeTaxLinesFromOrder(order);
    let additiveTotal = 0;

    // Only sum the additive taxes for total calculation
    for (const taxLine of taxLines) {
      if (!taxLine.included) {
        additiveTotal = this.roundCurrency(additiveTotal + taxLine.amount);
      }
    }

    const total = this.roundCurrency(subtotal + additiveTotal);

    doc.setFont('helvetica', 'normal');
    writeLineWithAmount('Subtotal', formatCurrency(subtotal));

    if (taxLines.length > 0) {
      taxLines.forEach((t) => {
        const label = t.included ? `${t.label} (incluido)` : t.label;
        const sign = t.included ? '' : '+';
        writeLineWithAmount(label, `${sign}${formatCurrency(t.amount)}`);
      });
    }

    drawDivider();

    doc.setFont('helvetica', 'bold');
    writeLineWithAmount('Total a pagar', formatCurrency(total));

    drawDivider();
    doc.setFont('helvetica', 'normal');
    writeBlock('Gracias por su preferencia', { align: 'center' });
    writeBlock('Generado por RestroLogic', { align: 'center', bold: true });

    const sanitized = (order.code || 'ticket')
      .toString()
      .replace(/[^a-zA-Z0-9_-]+/g, '_');
    const fileName = `Ticket_Cocina_${sanitized}.pdf`;

    this.openPdf(doc, fileName);
  }

  isItemUpdating(key: string): boolean {
    return this.updatingItemKeys().has(key);
  }

  onItemStatusChange(
    order: Order,
    item: OrderItemWithKey,
    index: number,
    nextStatus: OrderItemStatusType,
  ): void {
    if (!nextStatus) {
      return;
    }
    this.updateItemStatus(order, item, index, nextStatus);
  }

  advanceItemStatus(order: Order, item: OrderItemWithKey, index: number): void {
    const current = this.normalizeItemStatus(item);
    if (current === 'cancelled') {
      return;
    }
    const orderStatus = ['pending', 'preparing', 'ready', 'served'] as const;
    const currentIndex = orderStatus.indexOf(current);
    if (currentIndex === -1) {
      this.updateItemStatus(order, item, index, 'pending');
      return;
    }
    const next =
      orderStatus[Math.min(orderStatus.length - 1, currentIndex + 1)];
    if (next !== current) {
      this.updateItemStatus(order, item, index, next);
    }
  }

  itemStatusBadge(status: OrderItemStatusType): string {
    switch (status) {
      case 'pending':
        return 'badge badge-secondary';
      case 'preparing':
        return 'badge badge-warning';
      case 'ready':
        return 'badge badge-success';
      case 'served':
        return 'badge badge-primary';
      case 'cancelled':
        return 'badge badge-error';
      default:
        return 'badge badge-ghost';
    }
  }

  itemStatusLabel(status: OrderItemStatusType): string {
    const option = this.statusOptions.find((opt) => opt.value === status);
    if (option) {
      return option.label;
    }
    switch (status) {
      case 'cancelled':
        return 'Cancelado';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  }

  progressSummary(order: Order): string {
    const total = order.items?.length ?? 0;
    if (total === 0) {
      return 'Sin productos';
    }
    const ready = (order.items || []).filter((item) =>
      ['ready', 'served'].includes(this.normalizeItemStatus(item)),
    ).length;
    const preparing = (order.items || []).filter(
      (item) => this.normalizeItemStatus(item) === 'preparing',
    ).length;

    if (ready === total) {
      return 'Orden lista';
    }

    if (preparing > 0) {
      return `${ready}/${total} listos · ${preparing} en preparación`;
    }

    return `${ready}/${total} listos`;
  }

  tableLabel(order: Order): string {
    if (order.tableName) {
      return order.tableName;
    }
    const tableId = order.tableId;
    if (!tableId) {
      return 'Sin mesa';
    }
    const tables = this.tablesById();
    return tables.get(tableId) || `Online`;
  }

  createdByLabel(order: Order): string {
    const assigned = order.assignedToUserId || order.assignedTo;
    if (!assigned) {
      return 'Domicilio';
    }

    if (typeof assigned === 'string') {
      const assignedLower = assigned.toLowerCase();
      const name = this.usersById().get(assignedLower);
      // DEBUG LOG
      // console.log(`Looking for user ID: ${assigned}, found: ${name}, available keys:`, Array.from(this.usersById().keys()));
      if (name) {
        return name;
      }

      const currentUser = this.auth.me();
      if (currentUser && currentUser.id?.toLowerCase() === assignedLower) {
        return currentUser.fullName || currentUser.email || 'Tú (Admin)';
      }

      return `Mesero ${assigned.slice(0, 4)}...`;
    }

    const values = [
      (assigned as any).fullName,
      (assigned as any).name,
      (assigned as any).email,
    ].filter((value): value is string => !!value && value.trim().length > 0);
    return values[0] || 'Sin asignar';
  }

  orderStatusBadge(order: Order): string {
    const status = this.normalizeOrderStatus(order);
    switch (status) {
      case 'created':
        return 'badge badge-ghost';
      case 'preparing':
        return 'badge badge-warning';
      case 'ready':
        return 'badge badge-success';
      default:
        return 'badge badge-ghost';
    }
  }

  orderStatusLabel(order: Order): string {
    const status = this.normalizeOrderStatus(order);
    return status
      .split('-')
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ');
  }

  itemKey(order: Order, item: OrderItemWithKey, index: number): string {
    return [order.id, item.id || item.productId || index].join('::');
  }

  branchLabel(branch: BranchSummary): string {
    if (branch.name && branch.name.trim().length > 0) {
      return branch.name;
    }
    if ((branch as { code?: string }).code) {
      return (branch as { code?: string }).code!;
    }
    return `Sucursal ${branch.id.slice(0, 6)}`;
  }

  productLabel(item: OrderItemWithKey): string {
    const direct = (item.productName || '').trim();
    if (direct.length > 0) {
      return direct;
    }
    const map = this.productsById();
    const byId = item.productId ? map.get(item.productId) : undefined;
    if (byId && byId.trim().length > 0) {
      return byId;
    }
    return 'Producto';
  }

  // Extract size label from product name or notes when available
  sizeBadgeLabel(item: OrderItemWithKey): string | null {
    const sizeId = (item as any).sizeId as string | undefined;
    if (sizeId) {
      const sz = this.sizes().find((s) => s.id === sizeId);
      if (sz?.name) return sz.name;
    }
    const textSources: string[] = [];
    const directName = (item.productName || '').toString();
    if (directName) textSources.push(directName);
    const notes = (item.notes || '').toString();
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

  // Try to resolve subcategory from product catalog first; fall back to common keywords in name
  subcategoryBadgeLabel(item: OrderItemWithKey): string | null {
    const map = this.subcategoryByProductId();
    if (item.productId && map.has(item.productId)) {
      const label = map.get(item.productId);
      if (label && label.trim().length > 0) return label;
    }
    const name = (item.productName || '').toString();
    if (name && !/\bmitad\b/i.test(name)) {
      const known = ['tradicional', 'especial', 'premium', 'infantil'];
      const lower = name.toLowerCase();
      const hit = known.find((k) => lower.includes(k));
      if (hit) return hit.charAt(0).toUpperCase() + hit.slice(1);
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

  private initializeBranchContext(): void {
    const user = this.auth.me();
    // Regular user: fixed branch from profile, propagate to global service
    if (!this.isAdminUser() && user?.branchId) {
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
            // Cargar órdenes directamente
            this.loadKitchenOrders();
          }
        },
        error: (err) => {
          console.error('Error loading branch for kitchen view:', err);
          this.error.set('No se pudo cargar la sucursal.');
        },
      });
      return;
    }
    // Admin: fetch list for label usage; selection comes from header
    this.businessService.getBranches().subscribe({
      next: (res) => {
        const list = res || [];
        this.branches.set(list);
        const currentBranchId = this.branchSelection.selectedBranchId();
        if (!currentBranchId && list.length > 0) {
          this.branchSelection.setSelectedBranchId(list[0].id);
        }
        // Load initial data for the selected branch
        const branchToLoad =
          currentBranchId || (list.length > 0 ? list[0].id : null);
        if (branchToLoad) {
          this.loadTables(branchToLoad);
          this.loadProducts(branchToLoad);
          this.loadSizes(branchToLoad);
          this.loadUsers(branchToLoad);
          // Cargar órdenes directamente
          this.loadKitchenOrders();
        }
      },
      error: (err) => {
        console.error('Error loading branches for kitchen view:', err);
        this.error.set('No se pudieron cargar las sucursales.');
      },
    });
  }

  private loadBusinessInfo(): void {
    const tenantId = this.tenantId();
    if (!tenantId) {
      return;
    }
    this.businessService.getBusiness(tenantId).subscribe({
      next: (res) => {
        this.businessDetail.set(res.data || null);
      },
      error: (err) => {
        console.error('Error al cargar la información del negocio:', err);
      },
    });
  }

  private resolveBranchForOrder(order: Order): BranchSummary | undefined {
    const branchId = order.branchId || this.branchSelection.selectedBranchId();
    if (!branchId) {
      return undefined;
    }
    return this.branches().find((branch) => branch.id === branchId);
  }

  private loadTables(branchId: string): void {
    if (!this.tenantId() || !branchId) {
      this.tablesById.set(new Map());
      return;
    }

    this.tableService.getTables(branchId).subscribe({
      next: (res) => {
        const entries = (res || []).map((table) => {
          const label = table.name || 'Mesa';
          return [table.id, label] as [string, string];
        });
        this.tablesById.set(new Map(entries));
      },
      error: (err) => {
        console.error('Error loading tables for kitchen view:', err);
        this.tablesById.set(new Map());
      },
    });
  }

  private loadSizes(branchId: string): void {
    if (!this.tenantId() || !branchId) {
      this.sizes.set([]);
      return;
    }
    this.productSizeService.getProductSizes().subscribe({
      next: (list) => this.sizes.set(list || []),
      error: () => this.sizes.set([]),
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
              : typeof user?.firstName === 'string' &&
                  typeof user?.lastName === 'string'
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
          return [String(identifier).toLowerCase(), display] as [
            string,
            string,
          ];
        });
        const validEntries = entries.filter(
          (entry: any): entry is [string, string] => !!entry,
        );
        this.usersById.set(new Map(validEntries));
      },
      error: (err: any) => {
        console.error('Error loading users for kitchen view:', err);
        this.usersById.set(new Map());
      },
    });
  }

  private loadProducts(branchId: string): void {
    if (!this.tenantId() || !branchId) {
      this.productsById.set(new Map());
      this.subcategoryByProductId.set(new Map());
      return;
    }

    this.productService.getProducts().subscribe({
      next: (res) => {
        const list = (res || []) as Product[];
        const entries = list.map(
          (product) => [product.id, product.name] as [string, string],
        );
        const subcatEntries = list
          .map((product) => {
            const label = 'test';
            return label && label.trim().length > 0
              ? ([product.id, label] as [string, string])
              : null;
          })
          .filter((e): e is [string, string] => !!e);
        this.productsById.set(new Map(entries));
        this.subcategoryByProductId.set(new Map(subcatEntries));
      },
      error: (err) => {
        console.error('Error loading products for kitchen view:', err);
        this.productsById.set(new Map());
        this.subcategoryByProductId.set(new Map());
      },
    });
  }

  private loadKitchenOrders(): void {
    const branchId = this.branchSelection.selectedBranchId();
    if (!this.tenantId() || !branchId) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    // Use the correct endpoint: /api/orders/open with branchId filter and expand items
    this.orderService.listOpenOrders({ branchId, expand: 'items' }).subscribe({
      next: (ordersArray) => {
        // The response is an array of { order, items } objects, merge them
        const merged = (ordersArray || []).map((item: any) => {
          if (item.order) {
            return { ...item.order, items: item.items || [] };
          }
          return item;
        });

        const relevant = merged.filter((order: Order) =>
          this.shouldKeepOrderForKitchen(order),
        );
        relevant.sort((a: Order, b: Order) => this.compareOrders(a, b));
        this.kitchenOrders.set(relevant);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading kitchen orders:', err);
        this.loading.set(false);
        this.error.set(
          err?.error?.message ||
            'No se pudieron cargar las órdenes para cocina.',
        );
      },
    });
  }

  private updateItemStatus(
    order: Order,
    item: OrderItemWithKey,
    index: number,
    nextStatus: OrderItemStatusType,
  ): void {
    const branchId = this.branchSelection.selectedBranchId();
    if (!this.tenantId() || !branchId || !order.id || !item.id) {
      this.error.set('Información insuficiente para actualizar el item.');
      return;
    }

    const itemKey = this.itemKey(order, item, index);

    this.updatingItemKeys.update((set) => {
      const next = new Set(set);
      next.add(itemKey);
      return next;
    });

    // Map internal status to backend status format
    const backendStatus = this.mapStatusToBackend(nextStatus);

    this.orderService
      .updateOrderItem(order.id, item.id, { status: backendStatus })
      .subscribe({
        next: () => {
          this.updatingItemKeys.update((set) => {
            const next = new Set(set);
            next.delete(itemKey);
            return next;
          });
          // Reload orders to get fresh data
          this.loadKitchenOrders();
        },
        error: (err) => {
          console.error('Error updating order item status:', err);
          this.updatingItemKeys.update((set) => {
            const next = new Set(set);
            next.delete(itemKey);
            return next;
          });
          this.error.set(
            err?.error?.message ||
              'No se pudo actualizar el estatus del producto en cocina.',
          );
        },
      });
  }

  private mergeKitchenOrder(updated: Order): void {
    this.kitchenOrders.update((orders) => {
      const filtered = orders.filter((order) => order.id !== updated.id);
      if (this.shouldKeepOrderForKitchen(updated)) {
        filtered.push(updated);
        filtered.sort((a, b) => this.compareOrders(a, b));
      }
      return filtered;
    });
  }

  private shouldKeepOrderForKitchen(order: Order): boolean {
    // Mantener ordenes creadas desde menú público aunque no tengan mesa y estén en estado 'created' con items 'pending'.
    const rawStatus = (order.status as any)?.type
      ? String((order.status as any).type)
      : String(order.status || '');
    const orderStatus = rawStatus.toLowerCase();

    // Ocultar órdenes cerradas/pagadas/canceladas: la cocina solo muestra trabajo activo
    const inactiveStatuses = ['cancelled', 'closed', 'completed', 'paid'];
    if (inactiveStatuses.includes(orderStatus)) return false;

    // Requerimos items si queremos operar en cocina, pero si el SSE envió actualización sin items, conservarla (se validó en upsert)
    if (!order?.items || order.items.length === 0) return false;

    const statuses = order.items.map((i) => this.normalizeItemStatus(i));
    const active = statuses.filter((s) => s !== 'cancelled');
    if (active.length === 0) return false;

    // Caso especial: pedido público recién creado (status 'created') con items 'pending'
    if (order.source === 'public-menu' && orderStatus === 'created') {
      return true; // mostrar siempre para que la cocina pueda comenzar
    }

    // Mantener solo si hay items pendientes o en preparación
    // Una vez que todos los items están 'ready' o 'served', la orden desaparece de cocina
    const hasWork = statuses.some((s) => ['pending', 'preparing'].includes(s));
    return hasWork;
  }

  normalizeItemStatus(item: OrderItemWithKey): OrderItemStatusType {
    const rawStatus =
      typeof item.status === 'string'
        ? item.status
        : ((item.status as { type?: string } | undefined)?.type ?? '');
    const normalized = String(rawStatus || '')
      .toLowerCase()
      .trim();

    // Map backend status (PascalCase) to frontend status (lowercase)
    const backendToFrontend: Record<string, OrderItemStatusType> = {
      pending: 'pending',
      inpreparation: 'preparing',
      preparing: 'preparing',
      ready: 'ready',
      served: 'served',
      cancelled: 'cancelled',
    };

    return backendToFrontend[normalized] || 'pending';
  }

  // Map internal status to backend format (PascalCase)
  private mapStatusToBackend(status: OrderItemStatusType): string {
    const map: Record<OrderItemStatusType, string> = {
      pending: 'Pending',
      preparing: 'InPreparation',
      ready: 'Ready',
      served: 'Served',
      cancelled: 'Cancelled',
    };
    return map[status] || 'Pending';
  }

  private deriveOrderStatus(
    items: OrderItemWithKey[],
  ): 'created' | 'preparing' | 'ready' | 'served' {
    const statuses = items
      .map((item) => this.normalizeItemStatus(item))
      .filter((status) => status !== 'cancelled');
    if (statuses.length === 0) {
      return 'ready';
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

  private resolveQuantity(item: OrderItemWithKey): number {
    const rawQty =
      (item as { quantity?: number }).quantity ??
      (item as { qty?: number }).qty ??
      1;
    const qty = Number(rawQty);
    return Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1;
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private computeTaxLinesFromOrder(order: Order): Array<{
    label: string;
    amount: number;
    included: boolean;
  }> {
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
              ? tax.value
              : null;

        const rawAmountField =
          typeof tax.amount === 'number' && tax.amount > 0 ? tax.amount : null;
        const rawValueField =
          typeof tax.value === 'number' && tax.value > 0 ? tax.value : null;

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
          if (included && netSubtotalFromBackend !== null) {
            amount = this.roundCurrency(netSubtotalFromBackend * (pct / 100));
          } else if (!included && netSubtotalFromBackend !== null) {
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

  private normalizeOrderStatus(order: Order): string {
    const raw = order.status as any;
    if (typeof raw === 'string') {
      return raw.toLowerCase();
    }
    if (raw && typeof raw === 'object' && 'type' in raw) {
      return String(raw.type || '').toLowerCase();
    }
    return 'created';
  }

  isPublicMenuOrder(source: string): boolean {
    // Asumiendo que en tu Base de Datos guardas el origen de la orden.
    // Ajusta 'PUBLIC_MENU' al valor real que uses en tu enum o string.
    return source === 'PUBLIC_MENU' || source === 'ONLINE' || source === 'QR';
  }

  private openPdf(doc: jsPDF, fileName: string): void {
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const newWindow = window.open(url);
      if (!newWindow) {
        doc.save(fileName);
        URL.revokeObjectURL(url);
        return;
      }
      try {
        newWindow.document.title = fileName;
      } catch (err) {
        console.warn('No se pudo asignar el titulo del PDF:', err);
      }
      const revoke = () => URL.revokeObjectURL(url);
      newWindow.addEventListener('beforeunload', revoke);
      setTimeout(revoke, 60000);
    } catch (error) {
      console.error('Error al abrir el PDF del ticket de cocina:', error);
      doc.save(fileName);
    }
  }
}


