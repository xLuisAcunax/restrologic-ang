import { CommonModule } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import jsPDF from 'jspdf';

import { Table, TableService } from '../../../core/services/table.service';
import { TableStatusEnum } from '../../../core/enums/table-status.enum';
import { BranchSummary } from '../../../core/services/business.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  OrderItemRequest,
  OrderService,
  OrderItem,
} from '../../../core/services/order.service';
import { Order } from '../../../core/models/order.model';
import {
  Product,
  ProductService,
} from '../../../core/services/product.service';
import {
  Category,
  CategoryService,
} from '../../../core/services/category.service';
import {
  ProductSize,
  ProductSizeService,
} from '../../../core/services/product-size.service';
import {
  PriceAdjustment,
  PriceAdjustmentService,
} from '../../../core/services/price-adjustment.service';
import { PaymentDialogComponent } from './payment-dialog/payment-dialog.component';
import { PaymentDialogResult } from '../../../core/models/payment.model';
import { concat, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ProductConfiguratorForm } from './product-configurator-form/product-configurator-form';
import {
  PortionSelectorModalComponent,
  PortionSelectorResult,
} from './portion-selector-modal/portion-selector-modal.component';
import {
  BundleSelectionModalComponent,
  BundleSelectionResult,
  BundleGroupSelection,
} from './bundle-selection-modal/bundle-selection-modal.component';
import { ProductBundleService } from '../../../core/services/product-bundle.service';
import {
  RealtimeService,
  TablePresenceInfo,
} from '../../../core/services/realtime.service';
import { PaymentDto } from '../../../core/models/order.model';

export type TableDetailsData = {
  table: Table;
  branch?: BranchSummary;
  description?: string | null;
  status?: number;
  tenantId?: string;
  branchId?: string;
};

type CartItem = {
  id?: string;
  productId: string;
  name: string;
  displayName: string; // Name with portion info
  unitPrice: number;
  quantity: number;
  notes?: string;
  subtotal: number;
  sizeId?: string | null;
  // Bundle selections
  bundleName?: string;
  bundleSelections?: BundleGroupSelection[];
};

@Component({
  selector: 'app-table-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './table-details.component.html',
})
export class TableDetailsComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private orderService = inject(OrderService);
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private productSizeService = inject(ProductSizeService);
  private priceAdjustmentService = inject(PriceAdjustmentService);
  private tableService = inject(TableService);
  private bundleService = inject(ProductBundleService);
  private realtime = inject(RealtimeService);
  private dialog = inject(Dialog);
  private dialogRef = inject(DialogRef<TableDetailsComponent>);
  readonly data: TableDetailsData = inject(DIALOG_DATA);

  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  products = signal<Product[]>([]);
  categories = signal<Category[]>([]);
  productSizes = signal<ProductSize[]>([]);
  priceAdjustments = signal<PriceAdjustment[]>([]);
  search = signal<string>('');
  selectedCategoryId = signal<string | null>(null);
  cart = signal<CartItem[]>([]);
  currentOrder = signal<Order | null>(null);
  error = signal<string | null>(null);
  tablePresence = signal<TablePresenceInfo | null>(null);
  private leavingPresence = false;

  /** Mobile tab: 'menu' shows product browser, 'order' shows order summary */
  activeTab = signal<'menu' | 'order'>('menu');
  cartCount = computed(() =>
    this.cart().reduce((sum, i) => sum + i.quantity, 0),
  );
  isLockedByAnotherUser = computed(() => {
    const presence = this.tablePresence();
    const me = this.auth.me()?.id;
    return (
      !!presence?.locked &&
      !!presence.lockedBy?.userId &&
      presence.lockedBy.userId !== me
    );
  });

  /** Categories that have at least one product in the current product list */
  availableCategories = computed(() => {
    const productCategoryIds = new Set(
      this.products()
        .map((p) => p.categoryId)
        .filter((id): id is string => !!id),
    );
    return this.categories().filter((cat) => productCategoryIds.has(cat.id));
  });

  filteredProducts = computed(() => {
    const term = this.search().trim().toLowerCase();
    const categoryId = this.selectedCategoryId();
    let filtered = this.products();

    // Filter by category
    if (categoryId) {
      filtered = filtered.filter((p) => p.categoryId === categoryId);
    }

    // Filter by search term
    if (term) {
      filtered = filtered.filter((p) =>
        (p.name || '').toLowerCase().includes(term),
      );
    }

    return filtered;
  });

  ngOnInit(): void {
    void this.enterTablePresence();
    this.loadProducts();
    this.loadCategories();
    this.loadProductSizes();
    this.loadPriceAdjustments();
    this.loadActiveOrder();
  }

  ngOnDestroy(): void {
    void this.leaveTablePresence();
  }

  // ---------- Data loaders ----------
  private loadProducts() {
    const branchId = this.getBranchId();
    const filters = {
      branchId: branchId || undefined,
      onlyActive: true,
    };

    this.productService.getProductsWithFilters(filters).subscribe((items) => {
      const list = items || [];
      if (list.length === 0 && branchId) {
        // Fallback: load active products without branch filter so the picker is not empty
        this.productService
          .getProductsWithFilters({ onlyActive: true })
          .subscribe((fallback) => this.products.set(fallback || []));
      } else {
        this.products.set(list);
      }
    });
  }

  private loadCategories() {
    this.categoryService.getActiveCategories().subscribe({
      next: (categories) => this.categories.set(categories || []),
      error: () => this.categories.set([]),
    });
  }

  private loadProductSizes() {
    this.productSizeService.getProductSizes().subscribe({
      next: (sizes) => {
        console.log('[loadProductSizes] Loaded sizes:', sizes);
        this.productSizes.set(sizes || []);
      },
      error: (err) => {
        console.error('[loadProductSizes] Error:', err);
        this.productSizes.set([]);
      },
    });
  }

  private loadPriceAdjustments() {
    // Load all price adjustments and filter active ones on the client side
    this.priceAdjustmentService.getPriceAdjustments().subscribe({
      next: (adjustments) => {
        // Filter only active adjustments on the client side
        const activeAdjustments = (adjustments || []).filter(
          (adj) => adj.isActive !== false,
        );
        console.log(
          '[loadPriceAdjustments] Loaded adjustments:',
          activeAdjustments,
        );
        this.priceAdjustments.set(activeAdjustments);
      },
      error: (err) => {
        console.error('[loadPriceAdjustments] Error:', err);
        this.priceAdjustments.set([]);
      },
    });
  }

  /**
   * Get the price configuration for a product.
   * Returns:
   * - { requiresPortion: true } if the product needs portion selection
   * - { requiresPortion: false, price: number } if price can be determined without portion
   * - null if no price configuration found (use base price)
   */
  private getProductPriceConfig(
    product: Product,
  ):
    | { requiresPortion: true }
    | { requiresPortion: false; price: number }
    | null {
    const categoryId = product.categoryId;
    const subcategoryId = product.subcategoryId;

    if (!categoryId) return null;

    const adjustments = this.priceAdjustments();
    const sizes = this.productSizes();

    // Find adjustments that apply to this product
    const applicableAdjustments = adjustments.filter((adj) => {
      // Must match category
      if (adj.categoryId !== categoryId) return false;
      // If adjustment has subcategoryId, it must match
      if (adj.subcategoryId && adj.subcategoryId !== subcategoryId)
        return false;
      // If adjustment is for a specific product, it must match
      if (adj.productId && adj.productId !== product.id) return false;
      return true;
    });

    console.log(
      '[getProductPriceConfig] Product:',
      product.name,
      'Applicable adjustments:',
      applicableAdjustments,
    );

    if (applicableAdjustments.length === 0) {
      // No adjustments found, check if there are portions for this category
      const hasPortions = sizes.some(
        (s) => s.categoryId === categoryId && s.isActive !== false,
      );
      return hasPortions ? { requiresPortion: true } : null;
    }

    // Check if there's an adjustment WITHOUT a specific portion (applies to all)
    const generalAdjustment = applicableAdjustments.find(
      (adj) => !adj.productSizeId,
    );

    if (generalAdjustment) {
      // There's a general price adjustment without portion requirement
      const price = generalAdjustment.isPercentage
        ? product.price + product.price * (generalAdjustment.amount / 100)
        : generalAdjustment.amount;
      console.log(
        '[getProductPriceConfig] Found general adjustment, price:',
        price,
      );
      return { requiresPortion: false, price };
    }

    // All adjustments require specific portions
    const hasPortionAdjustments = applicableAdjustments.some(
      (adj) => adj.productSizeId,
    );
    if (hasPortionAdjustments) {
      console.log('[getProductPriceConfig] Requires portion selection');
      return { requiresPortion: true };
    }

    return null;
  }

  selectCategory(categoryId: string | null) {
    this.selectedCategoryId.set(categoryId);
  }

  private loadActiveOrder() {
    this.isLoading.set(true);
    this.orderService.getOpenOrderForTable(this.data.table.id).subscribe({
      next: (order) => {
        if (order) {
          // Ignore terminal orders so a cancelled/closed ticket does not
          // keep occupying the table details panel after the table is freed.
          const isTerminal = this.isTerminalOrderStatus(order.status);

          if (isTerminal) {
            this.currentOrder.set(null);
            this.cart.set([]);
          } else {
            if (order.id) {
              this.reloadOrder(order.id);
            } else {
              this.currentOrder.set(order);
            }
          }
        } else {
          this.currentOrder.set(null);
          this.cart.set([]);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        // 404 means no open order exists - this is a valid state, not an error
        if (err?.status === 404) {
          console.log('[loadActiveOrder] No open order for this table');
          this.currentOrder.set(null);
          this.cart.set([]);
        } else {
          console.error('[loadActiveOrder] Error:', err);
          this.error.set('No se pudo cargar la orden activa.');
        }
        this.isLoading.set(false);
      },
    });
  }

  // ---------- Cart helpers ----------
  private loadOrderItems(orderId: string) {
    this.orderService.listOrderItems(orderId).subscribe({
      next: (items) => {
        const mapped: CartItem[] = (items || []).map((item) => ({
          id: item.id,
          productId: item.productId,
          ...this.buildItemDisplay(item),
        }));
        this.cart.set(mapped);
      },
      error: () => this.cart.set([]),
    });
  }

  private buildItemDisplay(item: OrderItem) {
    const product = this.findProduct(item.productId);
    const qty = item.quantity || 1;
    // Use unitPrice from server if available, otherwise fallback to product price
    const unitPrice = item.unitPrice ?? product?.price ?? 0;
    // Use productName from server if available, otherwise fallback to local product name
    const name = item.productName || product?.name || item.productId;
    // Use sizeName from server if available, otherwise lookup locally
    const sizeName =
      item.sizeName ||
      (item.sizeId
        ? this.productSizes().find((s) => s.id === item.sizeId)?.name
        : null);
    const displayName = sizeName ? `${name} (${sizeName})` : name;
    return {
      name,
      displayName,
      unitPrice,
      quantity: qty,
      notes: item.notes || '',
      subtotal: this.computeItemSubtotal(unitPrice, qty),
      sizeId: item.sizeId || null,
    };
  }

  private findProduct(productId: string) {
    return this.products().find((p) => p.id === productId);
  }

  private computeItemSubtotal(unitPrice: number, quantity: number): number {
    return Math.max(
      0,
      Math.round((unitPrice * quantity + Number.EPSILON) * 100) / 100,
    );
  }

  addProduct(product: Product) {
    this.cart.update((items) => {
      const existing = items.find(
        (i) => i.productId === product.id && !i.sizeId,
      );
      if (existing) {
        existing.quantity += 1;
        existing.subtotal = this.computeItemSubtotal(
          existing.unitPrice,
          existing.quantity,
        );
        return [...items];
      }
      const newItem: CartItem = {
        productId: product.id,
        name: product.name,
        displayName: product.name,
        unitPrice: product.price,
        quantity: 1,
        subtotal: this.computeItemSubtotal(product.price, 1),
        sizeId: null,
      };
      return [...items, newItem];
    });
  }

  /** Add a product with a specific portion/size */
  addProductWithPortion(result: PortionSelectorResult) {
    this.cart.update((items) => {
      // For products with portions, check if same product + same size exists
      const existing = items.find(
        (i) =>
          i.productId === result.product.id &&
          i.sizeId === result.selectedSize?.id,
      );
      if (existing) {
        existing.quantity += 1;
        existing.subtotal = this.computeItemSubtotal(
          existing.unitPrice,
          existing.quantity,
        );
        return [...items];
      }
      const newItem: CartItem = {
        productId: result.product.id,
        name: result.product.name,
        displayName: result.displayName,
        unitPrice: result.finalPrice,
        quantity: 1,
        subtotal: this.computeItemSubtotal(result.finalPrice, 1),
        sizeId: result.selectedSize?.id || null,
      };
      return [...items, newItem];
    });
  }

  removeItem(index: number) {
    this.cart.update((items) => items.filter((_, idx) => idx !== index));
  }

  updateQuantity(index: number, delta: number) {
    this.cart.update((items) => {
      const clone = [...items];
      const item = clone[index];
      if (!item) return clone;
      const nextQty = Math.max(1, item.quantity + delta);
      item.quantity = nextQty;
      item.subtotal = this.computeItemSubtotal(item.unitPrice, nextQty);
      return clone;
    });
  }

  clearCart() {
    this.cart.set([]);
  }

  // ---------- Totals ----------
  get totals() {
    const subtotal = this.cart().reduce((sum, item) => sum + item.subtotal, 0);
    const taxesTotal = 0; // Se puede extender para aplicar impuestos configurados
    const discountsTotal = 0;
    const total = Math.max(0, subtotal + taxesTotal - discountsTotal);
    return {
      subtotal: this.roundCurrency(subtotal),
      taxesTotal: this.roundCurrency(taxesTotal),
      discountsTotal: this.roundCurrency(discountsTotal),
      total: this.roundCurrency(total),
    };
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  // ---------- Persistence ----------
  saveOrder() {
    if (this.isLockedByAnotherUser()) {
      const lockedBy =
        this.tablePresence()?.lockedBy?.userName || 'otro usuario';
      this.error.set('Esta mesa está siendo atendida por ' + lockedBy + '.');
      return;
    }

    if (this.cart().length === 0) {
      this.error.set('Agrega al menos un producto para guardar la orden.');
      return;
    }
    this.isSaving.set(true);
    this.error.set(null);

    if (!this.currentOrder()) {
      this.createOrderForTable();
    } else {
      this.syncOrderItems(this.currentOrder()!.id);
    }
  }

  private createOrderForTable() {
    const items = this.cart().map((item) => this.mapToItemRequest(item));
    this.orderService
      .createOrGetOrderForTable(this.data.table.id, {
        assignedToUserId: this.auth.me()?.id,
        items,
      })
      .subscribe({
        next: (order) => {
          // Check if returned order is already paid - this is a backend bug
          // The backend should create a new order instead of returning the paid one
          const status = (order?.status || '').toString().toLowerCase();
          const isFullyPaid = status === 'paid' || status === 'closed';

          if (isFullyPaid) {
            // Order is paid, we need to create a truly new order
            // Force creation by calling the create endpoint directly
            this.forceCreateNewOrder();
            return;
          }

          this.currentOrder.set(order);
          if (order?.id) {
            this.finalizeSavedOrder(order.id, order.status);
          } else {
            this.isSaving.set(false);
          }
        },
        error: () => {
          this.error.set('No se pudo crear la orden.');
          this.isSaving.set(false);
        },
      });
  }

  /**
   * Force creation of a new order when the backend incorrectly returns a paid order
   */
  private forceCreateNewOrder() {
    const branchId = this.getBranchId();
    if (!branchId) {
      this.error.set('No se encontró la sucursal.');
      this.isSaving.set(false);
      return;
    }

    // Use the direct order creation endpoint (without tableId to force new order)
    (
      this.orderService.createOrder({
        branchId,
        tableId: this.data.table.id,
        assignedToUserId: this.auth.me()?.id,
        items: this.cart().map((item) => this.mapToItemRequest(item)),
      }) as any
    ).subscribe({
      next: (res: any) => {
        const order = res?.data ?? res;
        this.currentOrder.set(order);
        if (order?.id) {
          this.finalizeSavedOrder(order.id, order.status);
        } else {
          this.isSaving.set(false);
        }
      },
      error: (err: any) => {
        console.error('Error creating new order:', err);
        this.error.set(
          'No se pudo crear una nueva orden. La mesa tiene una orden pagada que debe cerrarse primero.',
        );
        this.isSaving.set(false);
      },
    });
  }

  private syncOrderItems(orderId: string) {
    // Obtiene los items actuales, elimina los que ya no están y crea/actualiza los presentes en el carrito
    this.orderService.listOrderItems(orderId).subscribe({
      next: (serverItems) => {
        const cartItems = this.cart();
        const serverMap = new Map<string, OrderItem>();
        (serverItems || []).forEach((it) => {
          if (it.id) serverMap.set(it.id, it);
        });

        const deletions = (serverItems || []).filter(
          (si) => !cartItems.find((ci) => ci.id === si.id),
        );
        const updates = cartItems.filter((ci) => ci.id && serverMap.has(ci.id));
        const creations = cartItems.filter((ci) => !ci.id);

        const ops = [
          ...deletions.map((si) =>
            this.orderService.deleteOrderItem(orderId, si.id!),
          ),
          ...updates.map((ci) =>
            this.orderService.updateOrderItem(orderId, ci.id!, {
              quantity: ci.quantity,
              notes: ci.notes || null,
            }),
          ),
          ...creations.map((ci) =>
            this.orderService.addOrderItem(orderId, this.mapToItemRequest(ci)),
          ),
        ];

        if (ops.length === 0) {
          this.isSaving.set(false);
          return;
        }

        // Ejecutar operaciones en serie para simplicidad
        concat(...ops).subscribe({
          next: () => {},
          complete: () => {
            this.finalizeSavedOrder(orderId, this.currentOrder()?.status);
          },
          error: () => {
            this.error.set('No se pudieron sincronizar los ítems.');
            this.isSaving.set(false);
          },
        });
      },
      error: () => {
        this.error.set('No se pudieron obtener los ítems actuales.');
        this.isSaving.set(false);
      },
    });
  }

  private finalizeSavedOrder(
    orderId: string,
    currentStatus?: Order['status'] | string | null,
  ) {
    const normalized = (currentStatus || '').toString().trim().toLowerCase();
    const requiresSubmission = ['draft', 'created'].includes(normalized);

    if (!requiresSubmission) {
      this.reloadOrder(orderId);
      this.isSaving.set(false);
      return;
    }

    this.orderService.updateOrder(orderId, { status: 'Submitted' }).subscribe({
      next: () => {
        this.reloadOrder(orderId);
        this.isSaving.set(false);
      },
      error: () => {
        this.error.set('La orden se guardó, pero no se pudo pasar a pendiente.');
        this.reloadOrder(orderId);
        this.isSaving.set(false);
      },
    });
  }

  private mapToItemRequest(item: CartItem): OrderItemRequest {
    let options: any[] = [];
    let bundleNotes = '';

    if (item.bundleSelections && item.bundleSelections.length > 0) {
      options = item.bundleSelections.flatMap((group) =>
        group.selectedProducts.map((sel) => ({
          optionId: sel.product.product.id,
          quantity: sel.quantity,
        })),
      );

      bundleNotes = item.bundleSelections
        .flatMap((group) =>
          group.selectedProducts.map((sel) => {
            const qtyStr = sel.quantity > 1 ? `${sel.quantity}x ` : '';
            return `${qtyStr}${sel.product.product.name}`;
          }),
        )
        .join(' + ');
    }

    // Combine user notes and bundle notes
    let finalNotes: string | null = null;
    if (item.notes && bundleNotes) {
      finalNotes = `${item.notes}\n${bundleNotes}`;
    } else if (item.notes) {
      finalNotes = item.notes;
    } else if (bundleNotes) {
      finalNotes = bundleNotes;
    }

    return {
      productId: item.productId,
      productVariantId: null,
      sizeId: item.sizeId || null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      notes: finalNotes,
      options,
    };
  }

  // ---------- Payments ----------
  openPaymentDialog() {
    if (this.isLockedByAnotherUser()) {
      const lockedBy =
        this.tablePresence()?.lockedBy?.userName || 'otro usuario';
      this.error.set('Esta mesa está siendo atendida por ' + lockedBy + '.');
      return;
    }

    const order = this.currentOrder();
    if (!order) return;
    const total = order.total ?? this.totals.total;
    const payments = order.payments || [];
    const paid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const dialogRef = this.dialog.open(PaymentDialogComponent, {
      width: '520px',
      data: {
        total,
        paid,
        outstanding: Math.max(0, total - paid),
        currency: 'COP',
        payments,
      },
    });

    dialogRef.closed.subscribe((result: unknown) => {
      const payment = result as PaymentDialogResult | undefined;
      if (!payment) return;
      this.registerPayment(payment);
    });
  }

  private registerPayment(result: PaymentDialogResult) {
    const order = this.currentOrder();
    if (!order?.id) return;

    const normalizedStatus = (order.status || '').toString().toLowerCase();
    const canPay = ['submitted', 'partiallypaid'].includes(normalizedStatus);

    // If order is not in a payable status, first update to Submitted, then pay
    if (!canPay) {
      this.orderService
        .updateOrder(order.id, { status: 'Submitted' })
        .subscribe({
          next: () => this.processPayment(order.id, result),
          error: () =>
            this.error.set('No se pudo preparar la orden para el pago.'),
        });
    } else {
      this.processPayment(order.id, result);
    }
  }

  private processPayment(orderId: string, result: PaymentDialogResult) {
    this.orderService
      .createPayment(orderId, {
        amount: result.amount,
        method: result.method,
        reference: result.reference || '',
      })
      .subscribe({
        next: () => this.reloadOrder(orderId, result),
        error: () => this.error.set('No se pudo registrar el pago.'),
      });
  }

  private reloadOrder(orderId: string, paymentResult?: PaymentDialogResult) {
    const currentOrder = this.currentOrder();
    const optimisticPayments = paymentResult
      ? [
          ...(currentOrder?.payments || []),
          this.buildOptimisticPayment(paymentResult),
        ]
      : currentOrder?.payments || [];

    forkJoin({
      order: this.orderService.getOrder(orderId),
      payments: this.orderService.listPayments(orderId).pipe(
        catchError(() => of(optimisticPayments)),
      ),
    }).subscribe(({ order, payments }) => {
      if (!order) {
        this.currentOrder.set(null);
        this.cart.set([]);
        return;
      }

      order.payments = this.resolvePayments(payments, optimisticPayments);
      const isTerminal = this.isTerminalOrderStatus(order.status);

      if (isTerminal) {
        // Order reached a terminal status - free the table and close dialog
        const tenantId = this.getTenantId();
        const branchId = this.getBranchId();
        const tableId = this.data.table.id;

        if (tenantId && branchId && tableId) {
          this.tableService
            .updateTableStatus(
              tenantId,
              branchId,
              tableId,
              TableStatusEnum.Free,
            )
            .subscribe({
              next: () => {
                console.log('[TableDetails] Table freed after full payment');
                this.dialogRef.close();
              },
              error: (err) => {
                console.warn('[TableDetails] Could not free table:', err);
                this.dialogRef.close();
              },
            });
        } else {
          this.dialogRef.close();
        }
      } else {
        // Order still has pending balance - update view
        this.currentOrder.set(order);
        if (order.id) this.loadOrderItems(order.id);
      }
    });
  }

  private resolvePayments(
    payments: PaymentDto[] | null | undefined,
    optimisticPayments: PaymentDto[],
  ): PaymentDto[] {
    const normalized = Array.isArray(payments) ? payments : [];
    if (normalized.length > 0) {
      return normalized;
    }
    return optimisticPayments;
  }

  private buildOptimisticPayment(result: PaymentDialogResult): PaymentDto {
    return {
      method: result.method,
      amount: this.roundCurrency(result.amount),
      paidAt: new Date().toISOString(),
      paidBy: this.auth.me()?.fullName || 'Sistema',
      reference: result.reference || null,
      notes: result.notes || null,
      status: 'confirmed',
    };
  }

  private isTerminalOrderStatus(status?: Order['status'] | string | null) {
    const normalized = (status || '').toString().toLowerCase();
    return ['paid', 'closed', 'cancelled'].includes(normalized);
  }

  // ---------- UI helpers ----------
  formatStatus(status?: Order['status']): string {
    if (!status) return 'SIN ORDEN';
    const normalized = typeof status === 'string' ? status.toLowerCase() : '';
    return normalized.toUpperCase();
  }

  paymentsTotal(): number {
    const order = this.currentOrder();
    if (!order || !order.payments) return 0;
    return this.roundCurrency(
      order.payments.reduce((sum, p) => sum + (p.amount || 0), 0),
    );
  }

  outstanding(): number {
    const order = this.currentOrder();
    const total = order?.total ?? this.totals.total;
    return Math.max(0, this.roundCurrency(total - this.paymentsTotal()));
  }

  closeDialog() {
    void this.closeDialogWithPresenceRelease();
  }

  private getTenantId(): string | undefined {
    return this.data.tenantId || this.auth.me()?.tenantId;
  }

  private getBranchId(): string | undefined {
    return (
      this.data.branchId || this.auth.me()?.branchId || this.data.branch?.id
    );
  }

  private async enterTablePresence(): Promise<void> {
    const branchId = this.getBranchId();
    const tableId = this.data.table.id;
    const user = this.auth.me();

    if (!branchId || !tableId || !user?.id || !user.fullName) {
      return;
    }

    try {
      const presence = await this.realtime.enterTablePresence(
        branchId,
        tableId,
        user.id,
        user.fullName,
      );
      this.tablePresence.set(presence);
    } catch {}
  }

  private async leaveTablePresence(): Promise<void> {
    if (this.leavingPresence) {
      return;
    }

    const branchId = this.getBranchId();
    const tableId = this.data.table.id;
    const userId = this.auth.me()?.id;

    if (!branchId || !tableId || !userId) {
      return;
    }

    this.leavingPresence = true;
    try {
      await this.realtime.leaveTablePresence(branchId, tableId, userId);
    } finally {
      this.leavingPresence = false;
    }
  }

  private async closeDialogWithPresenceRelease(): Promise<void> {
    await this.leaveTablePresence();
    this.dialogRef.close();
  }

  onProductClick(product: Product) {
    if (this.isLockedByAnotherUser()) {
      const lockedBy =
        this.tablePresence()?.lockedBy?.userName || 'otro usuario';
      this.error.set('Esta mesa está siendo atendida por ' + lockedBy + '.');
      return;
    }

    // Check if product has options (modifiers)
    if (product.hasOptions) {
      this.openProductConfigurator(product);
      return;
    }

    // Get price configuration for the product
    const priceConfig = this.getProductPriceConfig(product);
    console.log(
      '[onProductClick] Product:',
      product.name,
      'Price config:',
      priceConfig,
    );

    if (priceConfig === null) {
      // No price adjustment configured, check for bundles then use product's base price
      this.checkAndAddProduct(product, product.price);
      return;
    }

    if (priceConfig.requiresPortion) {
      // Product requires portion selection
      this.openPortionSelector(product);
      return;
    }

    // Price is determined without portion, check for bundles
    this.checkAndAddProduct(product, priceConfig.price);
  }

  /**
   * Check if product has bundles with dynamic products and handle accordingly
   */
  private checkAndAddProduct(product: Product, price: number): void {
    this.bundleService.getBundles({ productId: product.id }).subscribe({
      next: (bundles) => {
        const activeBundle = bundles.find((b) => b.isActive);
        const hasDynamicGroups =
          activeBundle?.groups?.some((g) => g.useDynamicProduct) ?? false;

        if (hasDynamicGroups) {
          // Open bundle selection modal (no size selected)
          this.openBundleSelector(product, null, price);
        } else {
          // No dynamic groups, add directly
          this.addProductWithConfiguredPrice(product, price);
        }
      },
      error: (err) => {
        console.error('[checkAndAddProduct] Error:', err);
        // On error, add product without bundle
        this.addProductWithConfiguredPrice(product, price);
      },
    });
  }

  /** Add a product with a pre-configured price (no portion required) */
  private addProductWithConfiguredPrice(product: Product, price: number) {
    this.cart.update((items) => {
      const existing = items.find(
        (i) => i.productId === product.id && !i.sizeId,
      );
      if (existing) {
        existing.quantity += 1;
        existing.subtotal = this.computeItemSubtotal(
          existing.unitPrice,
          existing.quantity,
        );
        return [...items];
      }
      const newItem: CartItem = {
        productId: product.id,
        name: product.name,
        displayName: product.name,
        unitPrice: price,
        quantity: 1,
        subtotal: this.computeItemSubtotal(price, 1),
        sizeId: null,
      };
      return [...items, newItem];
    });
  }

  openPortionSelector(product: Product) {
    const dialogRef = this.dialog.open(PortionSelectorModalComponent, {
      data: { product },
      panelClass: 'modal-center',
    });

    dialogRef.closed.subscribe((result: unknown) => {
      const portionResult = result as PortionSelectorResult | undefined;
      if (portionResult) {
        // Check if product has bundles with dynamic groups
        this.checkAndAddProductWithPortion(portionResult);
      }
    });
  }

  /**
   * Check if product has bundles with dynamic products and open selection modal if needed
   */
  private checkAndAddProductWithPortion(
    portionResult: PortionSelectorResult,
  ): void {
    this.bundleService
      .getBundles({ productId: portionResult.product.id })
      .subscribe({
        next: (bundles) => {
          const activeBundle = bundles.find((b) => b.isActive);
          const hasDynamicGroups =
            activeBundle?.groups?.some((g) => g.useDynamicProduct) ?? false;

          if (hasDynamicGroups) {
            // Open bundle selection modal
            this.openBundleSelector(
              portionResult.product,
              portionResult.selectedSize,
              portionResult.finalPrice,
            );
          } else {
            // No dynamic groups, add directly
            this.addProductWithPortion(portionResult);
          }
        },
        error: (err) => {
          console.error('[checkAndAddProductWithPortion] Error:', err);
          // On error, add product without bundle
          this.addProductWithPortion(portionResult);
        },
      });
  }

  /**
   * Open bundle selection modal
   */
  openBundleSelector(
    product: Product,
    selectedSize: any | null,
    basePrice: number,
  ): void {
    const dialogRef = this.dialog.open(BundleSelectionModalComponent, {
      data: { product, selectedSize, basePrice },
      panelClass: 'modal-center',
    });

    dialogRef.closed.subscribe((result: unknown) => {
      const bundleResult = result as BundleSelectionResult | undefined;
      if (bundleResult) {
        this.addProductWithBundle(bundleResult);
      }
    });
  }

  /**
   * Add a product with bundle selections to the cart
   */
  private addProductWithBundle(result: BundleSelectionResult): void {
    const newItem: CartItem = {
      productId: result.product.id,
      name: result.product.name,
      displayName: result.displayName,
      unitPrice: result.totalPrice,
      quantity: 1,
      subtotal: this.computeItemSubtotal(result.totalPrice, 1),
      sizeId: result.selectedSize?.id || null,
      bundleName: result.bundleName,
      bundleSelections: result.groupSelections,
    };
    this.cart.update((items) => [...items, newItem]);
  }

  openProductConfigurator(product: Product) {
    const dialogRef = this.dialog.open(ProductConfiguratorForm, {
      data: { product },
      panelClass: 'full-screen-modal',
    });

    dialogRef.closed.subscribe((result) => {
      if (result) {
        this.addProduct(product);
      }
    });
  }

  /** Check if sale ticket can be generated */
  canGenerateSaleTicket(): boolean {
    const order = this.currentOrder();
    return !!order && this.cart().length > 0;
  }

  /** Generate and open sale ticket PDF */
  generateSaleTicket(): void {
    const order = this.currentOrder();
    if (!order || this.cart().length === 0) {
      return;
    }

    const branch = this.data.branch || null;
    const doc = new jsPDF({ unit: 'mm', format: [80, 200] });
    const baseFontSize = 10;
    doc.setFontSize(baseFontSize);
    const margin = 6;
    const defaultLineHeight = 4.5;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    let cursorY = margin;

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

    const formatCurrency = (value: number): string => {
      return `$${Math.round(value).toLocaleString('es-CO')}`;
    };

    const formatDateTime = (isoString: string): string => {
      const date = new Date(isoString);
      return date.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const orderTimestamp =
      order.updatedAt || order.createdAt || new Date().toISOString();

    addLogo();

    // Header
    doc.setFontSize(baseFontSize + 2);
    writeBlock('Ticket de venta', { align: 'center', bold: true });
    doc.setFontSize(baseFontSize);
    if (branch?.name) {
      writeBlock(branch.name, { align: 'center' });
    }
    if (branch?.address) {
      writeBlock(branch.address, { align: 'center' });
    }
    writeBlock(`Fecha: ${formatDateTime(orderTimestamp)}`, { align: 'center' });
    if (order.code) {
      writeBlock(`Orden: ${order.code}`, { align: 'center' });
    }
    writeBlock(`Mesa: ${this.data.table.name}`, { align: 'center' });

    writeBlock('', {});
    drawDivider();

    // Products
    doc.setFontSize(baseFontSize);
    doc.setFont('helvetica', 'bold');
    doc.text('Detalle', margin, cursorY);
    doc.text('Total', pageWidth - margin, cursorY, { align: 'right' });
    cursorY += defaultLineHeight;
    doc.setFont('helvetica', 'normal');

    this.cart().forEach((item) => {
      const lineLabel = `${item.quantity} x ${item.displayName}`;
      const itemTotal = formatCurrency(item.subtotal);
      writeLineWithAmount(lineLabel, itemTotal);
    });

    drawDivider();

    // Totals
    const totalsData = this.totals;
    writeLineWithAmount('Subtotal', formatCurrency(totalsData.subtotal));
    writeBlock('', {});
    doc.setFontSize(baseFontSize + 1);
    writeLineWithAmount('Total a pagar', formatCurrency(totalsData.total), {
      bold: true,
    });
    doc.setFontSize(baseFontSize);

    writeBlock('', {});
    drawDivider();
    writeBlock('Gracias por su preferencia', { align: 'center' });

    // Open PDF in new tab
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
  }
}
