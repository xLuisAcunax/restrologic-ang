import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService, CartItem } from '../../services/cart.service';
import { CartUiService } from '../../services/cart-ui.service';
import { PublicContextService } from '../../services/public-context.service';
import { OrderService } from '../../../core/services/order.service';
import { Router } from '@angular/router';
import { PublicTrackingService } from '../../services/public-tracking.service';
import { DeliveryFeeService } from '../../../core/services/delivery-fee.service';
import {
  CreatePublicOrderDto,
  DeliveryStatus,
} from '../../../core/models/order.model';
import { SizeService, Size } from '../../services/size.service';
import { GeocodingService } from '../../services/geocoding.service';
import { GeolocationService } from '../../../core/services/geolocation.service';
import { BranchDeliverySettings } from '../../../core/services/branch-delivery-settings.service';
import {
  PublicCheckoutConfig,
  PublicCheckoutService,
} from '../../services/public-checkout.service';
import { DeliveriesModuleConfig } from '../../../core/models/module.model';
import { firstValueFrom } from 'rxjs';

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
  deliveryFeeService = inject(DeliveryFeeService);
  sizesService = inject(SizeService);
  geocoder = inject(GeocodingService);
  geolocation = inject(GeolocationService);
  checkoutService = inject(PublicCheckoutService);

  private readonly sizes = signal<Size[]>([]);
  private readonly checkoutConfig = signal<PublicCheckoutConfig | null>(null);
  private readonly deliveryCoordinates = signal<{
    lat: number;
    lng: number;
  } | null>(null);

  private readonly loadedCheckoutKey = signal('');
  private readonly validatedAddress = signal('');
  readonly loadingCheckoutConfig = signal(false);
  readonly checkoutConfigError = signal('');
  readonly distanceLookupError = signal('');
  readonly calculatingDistance = signal(false);
  readonly estimatedDistanceKm = signal<number | null>(null);
  readonly deliveryFee = signal<number>(0);
  private readonly checkoutConfigEffect = effect(() => {
    const tenantId = this.ctx.tenantId();
    const branchId = this.ctx.branchId();
    if (!tenantId || !branchId) {
      return;
    }

    const key = `${tenantId}:${branchId}`;
    if (this.loadedCheckoutKey() === key) {
      return;
    }

    this.loadedCheckoutKey.set(key);
    this.loadCheckoutConfig(tenantId, branchId);

    if (this.sizes().length === 0) {
      this.sizesService.getSizes(tenantId, branchId).subscribe({
        next: (arr) => this.sizes.set(arr || []),
        error: () => this.sizes.set([]),
      });
    }
  });

  private readonly sizeNameToId = computed(() => {
    const map: Record<string, string> = {};
    for (const s of this.sizes()) {
      if (s?.name) {
        map[s.name.trim().toLowerCase()] = s.id;
      }
    }
    return map;
  });

  readonly deliverySettings = computed<BranchDeliverySettings | null>(
    () => this.checkoutConfig()?.deliverySettings ?? null,
  );
  readonly branchInfo = computed(() => this.checkoutConfig()?.branch ?? null);
  readonly hasAddress = computed(
    () => this.customerAddress().trim().length > 0,
  );
  readonly addressNeedsValidation = computed(() => {
    const address = this.customerAddress().trim();
    return address.length > 0 && address !== this.validatedAddress();
  });
  readonly canValidateAddress = computed(() => {
    if (!this.hasAddress()) {
      return false;
    }

    return (
      this.addressOk() &&
      !this.loadingCheckoutConfig() &&
      !this.calculatingDistance() &&
      this.addressNeedsValidation()
    );
  });
  readonly radiusExceeded = computed(() => {
    const dist = this.estimatedDistanceKm();
    const settings = this.deliverySettings();
    return dist != null && settings != null && dist > settings.deliveryRadiusKm;
  });
  readonly showDeliveryPreview = computed(
    () =>
      this.hasAddress() &&
      !this.addressNeedsValidation() &&
      this.estimatedDistanceKm() != null &&
      !this.distanceLookupError(),
  );
  readonly deliveryBlockedMessage = computed(() => {
    if (!this.hasAddress()) {
      return '';
    }

    if (this.checkoutConfigError()) {
      return this.checkoutConfigError();
    }

    const settings = this.deliverySettings();
    if (!settings) {
      return 'No fue posible cargar la configuración de domicilios.';
    }

    if (!settings.deliveryEnabled) {
      return 'La sucursal no tiene domicilios habilitados en este momento.';
    }

    if (!settings.enablePublicMenu) {
      return 'Los pedidos a domicilio desde el menú público no están disponibles ahora mismo.';
    }

    if (this.distanceLookupError()) {
      return this.distanceLookupError();
    }

    if (this.addressNeedsValidation()) {
      return '';
    }

    if (this.radiusExceeded()) {
      return `La dirección excede el radio máximo permitido de ${settings.deliveryRadiusKm} km.`;
    }

    return '';
  });

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
    /[0-9 ()+\-]{7,}/.test(this.customerPhone().trim()),
  );
  addressOk = computed(() => {
    const address = this.customerAddress().trim();
    return address.length === 0 || address.length >= 5;
  });
  deliveryValidationReady = computed(() => {
    if (!this.hasAddress()) {
      return true;
    }

    if (this.calculatingDistance()) {
      return false;
    }

    if (this.addressNeedsValidation()) {
      return false;
    }

    return (
      !this.deliveryBlockedMessage() &&
      this.deliveryCoordinates() !== null &&
      this.estimatedDistanceKm() !== null
    );
  });
  formValid = computed(
    () =>
      this.nameValid() &&
      this.phoneValid() &&
      this.addressOk() &&
      this.deliveryValidationReady(),
  );

  ngOnInit() {}

  private loadCheckoutConfig(tenantId: string, branchId: string) {
    this.loadingCheckoutConfig.set(true);
    this.checkoutConfigError.set('');

    this.checkoutService.getCheckoutConfig(tenantId, branchId).subscribe({
      next: (config) => {
        this.checkoutConfig.set(config);
        this.loadingCheckoutConfig.set(false);
      },
      error: () => {
        this.loadingCheckoutConfig.set(false);
        this.checkoutConfigError.set(
          'No fue posible cargar la configuración de domicilios de esta sucursal.',
        );
      },
    });
  }

  onCustomerAddressChange(value: string) {
    this.customerAddress.set(value);
    this.validatedAddress.set('');
    this.distanceLookupError.set('');
    this.estimatedDistanceKm.set(null);
    this.deliveryFee.set(0);
    this.deliveryCoordinates.set(null);
  }

  validateDeliveryAddress() {
    this.submitted.set(true);
    if (!this.canValidateAddress()) {
      return;
    }

    void this.refreshDeliveryEstimate();
  }

  private async refreshDeliveryEstimate() {
    const config = this.checkoutConfig();
    const settings = config?.deliverySettings ?? null;
    const branch = config?.branch ?? null;
    const address = this.customerAddress().trim();

    if (!address) {
      this.validatedAddress.set('');
      this.distanceLookupError.set('');
      this.estimatedDistanceKm.set(null);
      this.deliveryFee.set(0);
      this.deliveryCoordinates.set(null);
      return;
    }

    if (!settings) {
      this.distanceLookupError.set(
        'No fue posible cargar la configuración de domicilios.',
      );
      this.estimatedDistanceKm.set(null);
      this.deliveryFee.set(0);
      this.deliveryCoordinates.set(null);
      return;
    }

    if (!settings.deliveryEnabled) {
      this.validatedAddress.set('');
      this.distanceLookupError.set(
        'La sucursal no tiene domicilios habilitados en este momento.',
      );
      this.estimatedDistanceKm.set(null);
      this.deliveryFee.set(0);
      this.deliveryCoordinates.set(null);
      return;
    }

    if (!settings.enablePublicMenu) {
      this.distanceLookupError.set(
        'Los pedidos a domicilio desde el menú público no están disponibles ahora mismo.',
      );
      this.estimatedDistanceKm.set(null);
      this.deliveryFee.set(0);
      this.deliveryCoordinates.set(null);
      return;
    }

    if (
      typeof branch?.latitude !== 'number' ||
      typeof branch?.longitude !== 'number'
    ) {
      this.distanceLookupError.set(
        'La sucursal no tiene una ubicación configurada para calcular el domicilio.',
      );
      this.estimatedDistanceKm.set(null);
      this.deliveryFee.set(0);
      this.deliveryCoordinates.set(null);
      return;
    }

    this.calculatingDistance.set(true);
    this.distanceLookupError.set('');

    try {
      const tenantId = this.ctx.tenantId();
      const branchId = this.ctx.branchId();
      let coordinates: { latitude: number; longitude: number } | null = null;
      let usedSharedCache = false;

      if (tenantId && branchId) {
        try {
          const cached = await firstValueFrom(
            this.checkoutService.lookupCachedAddress(
              tenantId,
              branchId,
              address,
            ),
          );
          if (
            cached?.found &&
            typeof cached.location?.lat === 'number' &&
            typeof cached.location?.lng === 'number'
          ) {
            coordinates = {
              latitude: cached.location.lat,
              longitude: cached.location.lng,
            };
            usedSharedCache = true;
          }
        } catch {
          // Si el cache backend falla, continuamos con geocoding normal.
        }
      }

      if (!coordinates) {
        coordinates = await this.geocoder.geocodeAddress(
          address,
          branch.city || undefined,
        );
      }

      if (!coordinates) {
        this.distanceLookupError.set(
          'No pudimos ubicar esa dirección. Revisa la dirección e inténtalo nuevamente.',
        );
        this.estimatedDistanceKm.set(null);
        this.deliveryFee.set(0);
        this.deliveryCoordinates.set(null);
        return;
      }

      if (tenantId && branchId && !usedSharedCache) {
        this.checkoutService
          .storeCachedAddress(
            tenantId,
            branchId,
            address,
            {
              lat: coordinates.latitude,
              lng: coordinates.longitude,
            },
            branch.city,
            branch.country,
            'google',
          )
          .subscribe({ error: () => void 0 });
      }

      const distanceKm = Number(
        this.geolocation
          .calculateDistance(
            { latitude: branch.latitude, longitude: branch.longitude },
            coordinates,
          )
          .toFixed(2),
      );

      this.deliveryCoordinates.set({
        lat: coordinates.latitude,
        lng: coordinates.longitude,
      });
      this.estimatedDistanceKm.set(distanceKm);
      this.deliveryFee.set(this.computeBranchDeliveryFee(distanceKm, settings));
      this.validatedAddress.set(address);
    } catch {
      this.distanceLookupError.set(
        'No pudimos calcular el domicilio con esa dirección.',
      );
      this.estimatedDistanceKm.set(null);
      this.deliveryFee.set(0);
      this.deliveryCoordinates.set(null);
    } finally {
      this.calculatingDistance.set(false);
    }
  }

  private computeBranchDeliveryFee(
    distanceKm: number,
    settings: BranchDeliverySettings,
  ): number {
    const config: DeliveriesModuleConfig = {
      enablePublicMenu: settings.enablePublicMenu,
      deliveryRadiusKm: settings.deliveryRadiusKm,
      pricingBrackets: settings.pricingBrackets.map((bracket) => ({
        upToKm: bracket.upToKm,
        baseFee: bracket.baseFee,
        perKm: bracket.perKm ?? undefined,
      })),
      autoAssignmentStrategy: settings.autoAssignmentStrategy,
      routeProvider: settings.routeProvider,
      freeDeliveryThresholdKm: settings.freeDeliveryThresholdKm ?? null,
    };

    return this.deliveryFeeService.computeFee(distanceKm, config);
  }

  private resolveSizeId(sizeKey?: string): string | undefined {
    if (!sizeKey || sizeKey === 'unico') return undefined;
    const label = this.mapSizeLabel(sizeKey);
    const normalized = label.trim().toLowerCase();
    return this.sizeNameToId()[normalized];
  }

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
    if (!tenantId || !branchId) {
      return;
    }

    if (this.sizes().length === 0) {
      this.sizesService.getSizes(tenantId, branchId).subscribe({
        next: (arr) => {
          this.sizes.set(arr || []);
          void this.createOrder(tenantId, branchId);
        },
        error: () => {
          void this.createOrder(tenantId, branchId);
        },
      });
    } else {
      void this.createOrder(tenantId, branchId);
    }
  }

  private async createOrder(tenantId: string, branchId: string) {
    const items: any[] = this.cart.items().map((it) => {
      if (it.type === 'single') {
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
              }),
            )
            .join(' + ');
        }

        if (it.modifiers && it.modifiers.length > 0) {
          it.modifiers.forEach((m) => {
            options.push({ optionId: m.modifierId, quantity: 1 });
          });
        }

        const resolvedSizeId = it.sizeId || this.resolveSizeId(it.sizeKey);
        const finalUnitPrice =
          it.basePrice !== undefined ? it.basePrice : it.price;

        return {
          productId: it.productId,
          sizeId: resolvedSizeId || undefined,
          quantity: it.qty,
          unitPrice: finalUnitPrice,
          notes: bundleNotes || undefined,
          options,
        };
      }

      const sizeLabel = this.mapSizeLabel(it.sizeKey);
      const flavorA = (it.productNameA || '').replace(/^Pizza\s+/i, '');
      const flavorB = (it.productNameB || '').replace(/^Pizza\s+/i, '');
      const subcatA = it.subcategoryNameA || '';
      const subcatB = it.subcategoryNameB || '';
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
    });

    const address = this.customerAddress().trim();
    const distanceKm = this.estimatedDistanceKm();
    const fee = this.deliveryFee();
    const deliveryLocation = this.deliveryCoordinates();

    if (address.length > 0 && (!deliveryLocation || distanceKm == null)) {
      this.distanceLookupError.set(
        'Debes validar la dirección antes de confirmar el pedido.',
      );
      this.submitted.set(false);
      return;
    }

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
      delivery:
        address.length > 0 && distanceKm != null && deliveryLocation
          ? {
              requiresDelivery: true,
              address,
              distanceKm,
              fee,
              status: 'pending' as DeliveryStatus,
              location: deliveryLocation,
            }
          : undefined,
    };

    this.orders.createPublicOrder(dto).subscribe({
      next: (resp) => {
        const orderNumber = resp?.data?.orderNumber;
        const orderId = resp?.data?.id;
        const idForRoute = orderId || orderNumber;
        this.cart.clear();
        this.closeCheckout();
        this.ui.closeDrawer();
        this.customerName.set('');
        this.customerPhone.set('');
        this.customerAddress.set('');
        this.customerNotes.set('');
        this.estimatedDistanceKm.set(null);
        this.deliveryFee.set(0);
        this.deliveryCoordinates.set(null);
        this.distanceLookupError.set('');
        this.validatedAddress.set('');

        if (idForRoute) {
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
        if (err.status === 403 && err.error?.code === 'MODULE_DISABLED') {
          alert(
            'El sistema de pedidos públicos no está disponible en este momento. Por favor contacta al restaurante directamente.',
          );
        } else if (
          err.status === 422 &&
          (err.error?.message?.includes('RADIUS') ||
            err.error?.code === 'DELIVERY_RADIUS_EXCEEDED')
        ) {
          alert(
            `La distancia de entrega (${this.estimatedDistanceKm()} km) excede el radio máximo permitido (${err.error?.maxKm || this.deliverySettings()?.deliveryRadiusKm || 10} km).`,
          );
        } else {
          alert('No se pudo crear el pedido. Intenta nuevamente.');
        }
        this.submitted.set(false);
      },
    });
  }
}
