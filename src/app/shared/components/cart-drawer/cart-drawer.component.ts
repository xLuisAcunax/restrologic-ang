import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { CartService, CartItem } from '../../services/cart.service';
import { CartUiService } from '../../services/cart-ui.service';
import { PublicContextService } from '../../services/public-context.service';
import { OrderService } from '../../../core/services/order.service';
import { Router } from '@angular/router';
import { PublicTrackingService } from '../../services/public-tracking.service';
import { ModuleService } from '../../../core/services/module.service';
import { DeliveryFeeService } from '../../../core/services/delivery-fee.service';
import { ModuleAnalyticsService } from '../../../core/services/module-analytics.service';
import { DeliveriesModuleConfig } from '../../../core/models/module.model';
import { environment } from '../../../../environments/environment';
import { catchError, of } from 'rxjs';
import {
  CreatePublicOrderDto,
  OrderItemDto,
} from '../../../core/models/order.model';
import { SizeService, Size } from '../../services/size.service';

@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cart-drawer.component.html',
  styleUrls: ['./cart-drawer.component.css'],
})
export class CartDrawerComponent implements OnInit {
  cart = inject(CartService);
  ui = inject(CartUiService);
  ctx = inject(PublicContextService);
  orders = inject(OrderService);
  router = inject(Router);
  trackingStore = inject(PublicTrackingService);
  moduleService = inject(ModuleService);
  deliveryFeeService = inject(DeliveryFeeService);
  analytics = inject(ModuleAnalyticsService);
  http = inject(HttpClient);
  sizesService = inject(SizeService);

  private readonly baseUrl = environment.apiBaseUrl;
  private sizes = signal<Size[]>([]);
  private sizeNameToId = computed(() => {
    const map: Record<string, string> = {};
    for (const s of this.sizes()) {
      if (s?.name) map[s.name.trim().toLowerCase()] = s.id;
    }
    return map;
  });

  // Delivery fee calculation signals
  estimatedDistanceKm = signal<number | null>(null);
  deliveryFee = signal<number>(0);
  calculatingFee = signal(false);
  deliveriesConfig = computed(() =>
    this.moduleService.getModuleConfig<DeliveriesModuleConfig>('deliveries')
  );
  radiusExceeded = computed(() => {
    const dist = this.estimatedDistanceKm();
    const cfg = this.deliveriesConfig();
    return dist != null && cfg != null && dist > cfg.deliveryRadiusKm;
  });
  hasAddress = computed(() => this.customerAddress().trim().length > 0);
  showDeliveryPreview = computed(
    () => this.hasAddress() && this.estimatedDistanceKm() != null
  );

  ngOnInit() {
    const tenantId = this.ctx.tenantId();
    const branchId = this.ctx.branchId();
    if (tenantId && branchId) {
      this.sizesService.getSizes(tenantId, branchId).subscribe({
        next: (arr) => this.sizes.set(arr || []),
        error: () => this.sizes.set([]),
      });
    }
  }

  /**
   * Resolve sizeId from sizeKey using loaded sizes.
   * Maps sizeKey (personal, mediana, familiar) to size name in database.
   */
  private resolveSizeId(sizeKey?: string): string | undefined {
    if (!sizeKey || sizeKey === 'unico') return undefined;
    const label = this.mapSizeLabel(sizeKey);
    const normalized = label.trim().toLowerCase();
    const sizeId = this.sizeNameToId()[normalized];
    console.log('[resolveSizeId]', {
      sizeKey,
      label,
      normalized,
      sizeId,
      map: this.sizeNameToId(),
    });
    return sizeId;
  }

  // Helpers
  private sizeLabelFromKey(key?: string): string | null {
    if (!key || key === 'unico') return null;
    switch (key) {
      case 'personal':
        return 'Personal';
      case 'mediana':
        return 'Mediana';
      case 'familiar':
        return 'Familiar';
      default:
        return key;
    }
  }
  sizeBadge(item: CartItem): string | null {
    return this.sizeLabelFromKey(item.sizeKey);
  }

  private mapSizeLabel(key?: string): string {
    if (!key || key === 'unico') return '';
    switch (key) {
      case 'personal':
        return 'Personal';
      case 'mediana':
        return 'Mediana';
      case 'familiar':
        return 'Familiar';
      default:
        return key;
    }
  }

  // Checkout form state
  checkoutOpen = signal(false);
  customerName = signal('');
  customerPhone = signal('');
  customerAddress = signal('');
  customerNotes = signal('');
  submitted = signal(false);

  // Validations
  nameValid = computed(() => this.customerName().trim().length >= 2);
  phoneValid = computed(() =>
    /[0-9 ()+\-]{7,}/.test(this.customerPhone().trim())
  );
  // Dirección opcional: si está vacía => pickup; si tiene contenido, mínimo 5
  addressOk = computed(() => {
    const a = this.customerAddress().trim();
    return a.length === 0 || a.length >= 5;
  });
  formValid = computed(
    () =>
      this.nameValid() &&
      this.phoneValid() &&
      this.addressOk() &&
      !this.radiusExceeded()
  );

  /**
   * Compute delivery fee preview using backend endpoint.
   * Calls GET /deliveries/fee for server-side calculation.
   */
  computeFeePreview(distanceKm: number) {
    const tenantId = this.ctx.tenantId();
    const branchId = this.ctx.branchId();

    if (!tenantId || !branchId || distanceKm <= 0) {
      this.estimatedDistanceKm.set(null);
      this.deliveryFee.set(0);
      return;
    }

    this.estimatedDistanceKm.set(distanceKm);
    this.calculatingFee.set(true);

    const params = new HttpParams()
      .set('distanceKm', distanceKm.toString())
      .set('tenantId', tenantId)
      .set('branchId', branchId);

    this.http
      .get<{
        ok: boolean;
        fee: number;
        distanceKm: number;
        maxDeliveryRadiusKm: number;
      }>(`${this.baseUrl}/deliveries/fee`, { params })
      .pipe(
        catchError((err) => {
          console.error('Error calculando fee:', err);
          // Fallback a cálculo local si backend falla
          const localFee = this.deliveryFeeService.computeFee(distanceKm);
          return of({
            ok: true,
            fee: localFee,
            distanceKm,
            maxDeliveryRadiusKm: 10,
          });
        })
      )
      .subscribe((response) => {
        this.deliveryFee.set(response.fee);
        this.calculatingFee.set(false);
        // Track fee bracket usage for analytics (metadata reducido)
        this.analytics.trackModuleEvent(
          'deliveries',
          'fee_preview_calculated',
          {
            distanceKm: response.distanceKm,
            fee: response.fee,
          }
        );
      });
  }

  trackById(_i: number, it: CartItem) {
    return it.id;
  }

  inc(id: string) {
    this.cart.inc(id);
  }
  dec(id: string) {
    this.cart.dec(id);
  }
  remove(id: string) {
    this.cart.remove(id);
  }

  openCheckout() {
    this.checkoutOpen.set(true);
  }
  closeCheckout() {
    this.checkoutOpen.set(false);
  }

  placeOrder() {
    this.submitted.set(true);
    if (!this.formValid()) {
      return;
    }
    const tenantId = this.ctx.tenantId();
    const branchId = this.ctx.branchId();
    if (!tenantId || !branchId) return;

    // Ensure sizes are loaded before creating order
    if (this.sizes().length === 0) {
      console.log('[placeOrder] Loading sizes first...');
      this.sizesService.getSizes(tenantId, branchId).subscribe({
        next: (arr) => {
          this.sizes.set(arr || []);
          console.log('[placeOrder] Sizes loaded:', arr);
          this.createOrder(tenantId, branchId);
        },
        error: (err) => {
          console.error('[placeOrder] Failed to load sizes:', err);
          // Continue anyway - items without sizeId will fail on backend
          this.createOrder(tenantId, branchId);
        },
      });
    } else {
      this.createOrder(tenantId, branchId);
    }
  }

  private createOrder(tenantId: string, branchId: string) {
    const items: any[] = this.cart.items().map((it) => {
      if (it.type === 'single') {
        // We no longer add auto-generated description text to order notes.
        // Only map modifiers structurally; leave notes undefined.

        // Build bundle options
        let options: any[] = [];
        let bundleNotes = '';
        if (it.bundleSelections && it.bundleSelections.length > 0) {
          options = it.bundleSelections.flatMap((group: any) =>
            group.selectedProducts.map((sel: any) => ({
              optionId: sel.product.product.id,
              quantity: sel.quantity,
            })),
          );

          bundleNotes = it.bundleSelections
            .flatMap((group: any) =>
              group.selectedProducts.map((sel: any) => {
                const qtyStr = sel.quantity > 1 ? `${sel.quantity}x ` : '';
                return `${qtyStr}${sel.product.product.name}`;
              })
            )
            .join(' + ');
        }

        // Map cart modifiers into options as well (public menu UI logic)
        if (it.modifiers && it.modifiers.length > 0) {
          it.modifiers.forEach((m) => {
            options.push({ optionId: m.modifierId, quantity: 1 });
          });
        }

        const resolvedSizeId = it.sizeId || this.resolveSizeId(it.sizeKey);
        const finalUnitPrice =
          it.basePrice !== undefined ? it.basePrice : it.price;
        console.log('[placeOrder item]', {
          productName: it.productName,
          price: it.price,
          basePrice: it.basePrice,
          finalUnitPrice,
          modifiers: it.modifiers,
          bundleSelections: it.bundleSelections,
        });

        return {
          productId: it.productId,
          sizeId: resolvedSizeId || undefined,
          quantity: it.qty,
          unitPrice: finalUnitPrice,
          notes: bundleNotes || undefined, // send as notes to differentiate half-and-half bundle vs simple product on legacy endpoints
          options,
        };
      } else {
        // Half/half: enviar metadata estructurada y rótulo compuesto
        const sizeLabel = this.mapSizeLabel(it.sizeKey);
        const flavorA = (it.productNameA || '').replace(/^Pizza\s+/i, '');
        const flavorB = (it.productNameB || '').replace(/^Pizza\s+/i, '');
        const subcatA = it.subcategoryNameA || '';
        const subcatB = it.subcategoryNameB || '';

        // Build the detailed description in parentheses
        const detailA = [flavorA, subcatA].filter((s) => s).join(' ');
        const detailB = [flavorB, subcatB].filter((s) => s).join(' ');

        const fullProductName = `Pizza ${sizeLabel} Mitad/Mitad (${detailA} + ${detailB})`;

        return {
          productId: it.productIdA,
          sizeId: it.sizeId || this.resolveSizeId(it.sizeKey) || undefined,
          quantity: it.qty,
          unitPrice: it.price,
          notes: fullProductName,
          options: [],
        };
      }
    });

    const subtotal = this.cart.total();
    const address = this.customerAddress().trim();
    const distanceKm = this.estimatedDistanceKm();
    const fee = this.deliveryFee();

    const dto: CreatePublicOrderDto = {
      tenantId,
      branchId,
      source: 'public-menu',
      isTakeaway: address.length === 0,
      customer: {
        name: this.customerName().trim(),
        phone: this.customerPhone().trim(),
        address: address.length > 0 ? address : undefined,
        notes: this.customerNotes().trim() || undefined,
      },
      items,
      // Include delivery metadata if address provided (Phase A)
      delivery:
        address.length > 0 && distanceKm != null
          ? {
            requiresDelivery: true,
            address,
            distanceKm,
            fee,
            status: 'pending',
          }
          : undefined,
    };

    this.orders.createPublicOrder(dto).subscribe({
      next: (resp) => {
        const orderNumber = resp?.data?.orderNumber;
        const orderId = resp?.data?.id;
        // Use the real order ID for API lookups; show number later in the page
        const idForRoute = orderId || orderNumber;
        this.cart.clear();
        this.closeCheckout();
        this.ui.closeDrawer();
        if (idForRoute) {
          // Persist order id for tracking flow
          this.trackingStore.set(String(orderId || idForRoute));
          this.router.navigate(['/seguimiento'], {
            queryParams: { tenantId, branchId, orderId: idForRoute },
          });
        } else {
          alert('Pedido creado correctamente');
        }
      },
      error: (err) => {
        console.error('Error creando pedido', err);
        // Handle module gating error (403)
        if (err.status === 403 && err.error?.code === 'MODULE_DISABLED') {
          alert(
            '⚠️ El sistema de pedidos públicos no está disponible en este momento. Por favor contacta al restaurante directamente.'
          );
        } else if (
          err.status === 422 &&
          err.error?.message?.includes('RADIUS')
        ) {
          alert(
            `⚠️ La distancia de entrega (${this.estimatedDistanceKm()} km) excede el radio máximo permitido (${err.error?.maxKm || 10
            } km). Por favor verifica la dirección.`
          );
        } else {
          alert('No se pudo crear el pedido. Intenta nuevamente.');
        }
        this.submitted.set(false);
      },
    });
  }
}
