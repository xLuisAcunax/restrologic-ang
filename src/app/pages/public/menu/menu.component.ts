import {
  Component,
  inject,
  OnInit,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  CartService,
  CartModifierSelection,
} from '../../../shared/services/cart.service';
import { PublicContextService } from '../../../shared/services/public-context.service';
import { CartPreviewComponent } from '../../../shared/components/cart-preview/cart-preview.component';
import {
  PublicMenuService,
  PublicMenuItem,
} from '../../../shared/services/public-menu.service';
import {
  ProductModifierGroup,
  Modifier,
  ModifierService,
} from '../../../core/services/modifier.service';
import {
  ProductService,
  Product,
} from '../../../core/services/product.service';
import {
  Category,
  CategoryService,
} from '../../../core/services/category.service';
import {
  Subcategory,
  SubcategoryService,
} from '../../../core/services/subcategory.service';
import { forkJoin, of, fromEvent, Subscription } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ModuleService } from '../../../core/services/module.service';
import { DeliveriesModuleConfig } from '../../../core/models/module.model';
import { DeliveryFeeService } from '../../../core/services/delivery-fee.service';
import { ModuleAnalyticsService } from '../../../core/services/module-analytics.service';
import {
  PublicCheckoutConfig,
  PublicCheckoutService,
} from '../../../shared/services/public-checkout.service';
import {
  PriceAdjustmentService,
  PriceAdjustment,
} from '../../../core/services/price-adjustment.service';
import {
  ProductSizeService,
  ProductSize,
} from '../../../core/services/product-size.service';
import { ProductBundleService } from '../../../core/services/product-bundle.service';
import {
  BundleSelectionModalComponent,
  BundleSelectionResult,
} from '../../user/tables/bundle-selection-modal/bundle-selection-modal.component';
import {
  PortionSelectorModalComponent,
  PortionSelectorResult,
} from '../../user/tables/portion-selector-modal/portion-selector-modal.component';
import { Dialog } from '@angular/cdk/dialog';

@Component({
  selector: 'app-public-menu',
  standalone: true,
  imports: [CommonModule, CartPreviewComponent],
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.css'],
})
export class PublicMenuComponent implements OnInit, AfterViewInit, OnDestroy {
  menuService = inject(PublicMenuService);
  productService = inject(ProductService);
  categoryService = inject(CategoryService);
  subcategoryService = inject(SubcategoryService);
  route = inject(ActivatedRoute);
  cart = inject(CartService);
  ctx = inject(PublicContextService);
  modifierService = inject(ModifierService);
  moduleService = inject(ModuleService);
  deliveryFee = inject(DeliveryFeeService);
  analytics = inject(ModuleAnalyticsService);
  checkoutService = inject(PublicCheckoutService);
  priceAdjustmentService = inject(PriceAdjustmentService);
  productSizeService = inject(ProductSizeService);
  dialog = inject(Dialog);
  bundleService = inject(ProductBundleService);

  // Deliveries module gating
  deliveriesEnabled = computed(() =>
    this.moduleService.isModuleEnabled('deliveries'),
  );
  deliveriesConfig = computed(() =>
    this.moduleService.getModuleConfig<DeliveriesModuleConfig>('deliveries'),
  );
  publicMenuAllowed = computed(() => {
    const cfg = this.deliveriesConfig();
    return this.deliveriesEnabled() && !!cfg?.enablePublicMenu;
  });
  checkoutConfig = signal<PublicCheckoutConfig | null>(null);
  checkoutStatusLoading = signal(false);
  checkoutStatusError = signal('');
  publicOrderingEnabled = computed(() => {
    const settings = this.checkoutConfig()?.deliverySettings;
    return !!settings && settings.deliveryEnabled && settings.enablePublicMenu;
  });
  publicOrderingMessage = computed(() => {
    if (this.checkoutStatusLoading()) {
      return 'Estamos verificando la disponibilidad de pedidos en linea para esta sucursal.';
    }

    if (this.checkoutStatusError()) {
      return 'Temporalmente no es posible tomar pedidos desde este menu. Intenta nuevamente mas tarde.';
    }

    const settings = this.checkoutConfig()?.deliverySettings;
    if (!settings) {
      return 'Temporalmente no es posible tomar pedidos desde este menu.';
    }

    if (!settings.deliveryEnabled) {
      return 'Los domicilios estan temporalmente deshabilitados para esta sucursal.';
    }

    if (!settings.enablePublicMenu) {
      return 'Temporalmente no estamos recibiendo pedidos desde el menu publico.';
    }

    return '';
  });

  productsByCategory = signal<Record<string, Record<string, PublicMenuItem[]>>>(
    {},
  );
  loading = signal(true);
  selectedCategory = signal<string | null>(null);

  // Price adjustment data
  priceAdjustments = signal<PriceAdjustment[]>([]);
  productSizes = signal<ProductSize[]>([]);

  // Expose Math for template
  readonly Math = Math;

  tenantId = '';
  branchId = '';

  // Tabs scroll state for mobile hint/arrows
  @ViewChild('tabsScroll') tabsScroll?: ElementRef<HTMLElement>;
  tabsScrollable = signal(false);
  tabsCanScrollLeft = signal(false);
  tabsCanScrollRight = signal(false);
  private resizeSub?: Subscription;

  ngOnInit(): void {
    // Get tenantId and branchId from route params or query params
    this.route.queryParams.subscribe((params) => {
      this.tenantId = params['tenantId'] || '';
      this.branchId = params['branchId'] || '';

      if (this.tenantId && this.branchId) {
        this.ctx.setTenantBranch(this.tenantId, this.branchId);
        this.loadCheckoutStatus();
        this.loadMenu();
        this.categoryService.loadCategoriesIfNeeded();
        this.subcategoryService.forceRefresh();
        // Periodic refresh to reflect product add/delete without manual reload
        this.setupAutoRefresh();
      }
    });
  }

  private loadCheckoutStatus() {
    if (!this.tenantId || !this.branchId) {
      this.checkoutConfig.set(null);
      this.checkoutStatusError.set('');
      this.checkoutStatusLoading.set(false);
      return;
    }

    this.checkoutStatusLoading.set(true);
    this.checkoutStatusError.set('');

    this.checkoutService
      .getCheckoutConfig(this.tenantId, this.branchId)
      .subscribe({
        next: (config) => {
          this.checkoutConfig.set(config);
          this.checkoutStatusLoading.set(false);
        },
        error: () => {
          this.checkoutConfig.set(null);
          this.checkoutStatusLoading.set(false);
          this.checkoutStatusError.set(
            'Temporalmente no es posible tomar pedidos desde este menu. Intenta nuevamente mas tarde.',
          );
        },
      });
  }

  private canOrderFromPublicMenu(): boolean {
    return this.publicOrderingEnabled();
  }

  ngAfterViewInit(): void {
    // Initialize scroll state after view renders
    setTimeout(() => this.updateTabsState(), 0);
    this.resizeSub = fromEvent(window, 'resize').subscribe(() =>
      this.updateTabsState(),
    );
  }

  ngOnDestroy(): void {
    this.resizeSub?.unsubscribe();
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  onTabsScroll() {
    this.updateTabsState();
  }

  scrollTabs(dir: 'left' | 'right') {
    const el = this.tabsScroll?.nativeElement;
    if (!el) return;
    const delta = Math.max(120, Math.floor(el.clientWidth * 0.6));
    el.scrollBy({ left: dir === 'left' ? -delta : delta, behavior: 'smooth' });
  }

  private updateTabsState() {
    const el = this.tabsScroll?.nativeElement;
    if (!el) {
      this.tabsScrollable.set(false);
      this.tabsCanScrollLeft.set(false);
      this.tabsCanScrollRight.set(false);
      return;
    }
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const canScroll = maxScrollLeft > 2;
    this.tabsScrollable.set(canScroll);
    this.tabsCanScrollLeft.set(canScroll && el.scrollLeft > 2);
    this.tabsCanScrollRight.set(canScroll && el.scrollLeft < maxScrollLeft - 2);
  }

  loadMenu() {
    this.loading.set(true);

    // Load price adjustments and product sizes first
    forkJoin({
      priceAdjustments: this.priceAdjustmentService
        .getPriceAdjustments()
        .pipe(catchError(() => of([]))),
      productSizes: this.productSizeService
        .getProductSizes()
        .pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ priceAdjustments, productSizes }) => {
        // Filter only active adjustments
        const activeAdjustments = (priceAdjustments || []).filter(
          (adj) => adj.isActive !== false,
        );
        this.priceAdjustments.set(activeAdjustments);
        this.productSizes.set(productSizes || []);
        console.log('Price adjustments loaded:', activeAdjustments);
        console.log('Product sizes loaded:', productSizes);

        // Now load products
        this.loadProducts();
      },
      error: () => {
        // Continue loading products even if price data fails
        this.loadProducts();
      },
    });
  }

  private loadProducts() {
    // Get products from ProductService
    this.productService.getProducts(['Modifier', 'Simple']).subscribe({
      next: (products) => {
        console.log('Menu loaded. Products:', products);

        // Filter active products
        const activeProducts = products.filter((p) => p.isActive);

        if (activeProducts.length === 0) {
          this.productsByCategory.set({});
          this.loading.set(false);
          return;
        }

        // Load modifiers for each product
        const modifierRequests = activeProducts.map((product) =>
          this.modifierService
            .getProductModifierGroups(this.tenantId, this.branchId, product.id)
            .pipe(
              map((response) => ({
                productId: product.id,
                modifierGroups: response.data || [],
              })),
              catchError((err) => {
                console.error(
                  `Error loading modifiers for product ${product.id}:`,
                  err,
                );
                return of({ productId: product.id, modifierGroups: [] });
              }),
            ),
        );

        if (modifierRequests.length === 0) {
          this.productsByCategory.set({});
          this.loading.set(false);
          return;
        }

        forkJoin(modifierRequests).subscribe({
          next: (modifierResults) => {
            // Attach modifiers to products
            const productsWithModifiers = activeProducts.map((product) => {
              const modifierData = modifierResults.find(
                (m) => m.productId === product.id,
              );
              return {
                ...product,
                modifierGroups: modifierData?.modifierGroups || [],
              } as PublicMenuItem;
            });

            console.log(
              'Products with loaded modifiers:',
              productsWithModifiers,
            );

            // Group by category, then by subcategory
            const grouped: Record<
              string,
              Record<string, PublicMenuItem[]>
            > = {};
            const uniqueCategories: Category[] =
              this.categoryService.categories();

            productsWithModifiers.forEach((product: any) => {
              const categoryId = product.categoryId || '';
              const subcategoryId = product.subcategoryId || 'sin-subcategoria';
              const categoryName = product.category?.name || 'Sin categoría';

              if (!categoryId) return; // Skip products without category

              // Track unique categories
              if (!uniqueCategories.find((c) => c.id === categoryId)) {
                uniqueCategories.push({
                  id: categoryId,
                  name: categoryName,
                } as Category);
              }

              // Create category group if not exists
              if (!grouped[categoryId]) {
                grouped[categoryId] = {};
              }

              // Create subcategory group if not exists
              if (!grouped[categoryId][subcategoryId]) {
                grouped[categoryId][subcategoryId] = [];
              }

              // Add product to subcategory
              grouped[categoryId][subcategoryId].push(product);
            });

            console.log('Products grouped by category/subcategory:', grouped);

            // Store the grouped data
            this.productsByCategory.set(grouped as any);
            this.loading.set(false);

            // Select first category by default
            if (uniqueCategories.length > 0) {
              this.selectedCategory.set(uniqueCategories[0].id);
            }
          },
          error: (err) => {
            console.error('Error loading modifiers:', err);
            // Still show products even if modifiers fail
            const grouped: Record<
              string,
              Record<string, PublicMenuItem[]>
            > = {};
            const uniqueCategories: Category[] = [];

            activeProducts.forEach((product: any) => {
              const categoryId = product.categoryId || '';
              const subcategoryId = product.subcategoryId || 'sin-subcategoria';
              const categoryName = product.category?.name || 'Sin categorí­a';

              if (!categoryId) return;

              if (!uniqueCategories.find((c) => c.id === categoryId)) {
                uniqueCategories.push({
                  id: categoryId,
                  name: categoryName,
                } as Category);
              }

              if (!grouped[categoryId]) {
                grouped[categoryId] = {};
              }

              if (!grouped[categoryId][subcategoryId]) {
                grouped[categoryId][subcategoryId] = [];
              }

              grouped[categoryId][subcategoryId].push(product);
            });

            this.productsByCategory.set(grouped as any);
            this.loading.set(false);

            if (uniqueCategories.length > 0) {
              this.selectedCategory.set(uniqueCategories[0].id);
            }
          },
        });
      },
      error: (err) => {
        console.error('Error loading products:', err);
        this.loading.set(false);
      },
    });
  }

  // ========== Auto Refresh Logic ==========
  private refreshTimer: any = null;
  private lastRefresh = 0;
  // Disabled auto-refresh to prevent losing user selection state (e.g., pizza halves)
  // private readonly REFRESH_INTERVAL_MS = 60000; // 1 min
  private readonly MIN_INTERVAL_BETWEEN_MANUAL_REFRESH_MS = 5000;

  private setupAutoRefresh() {
    // Auto-refresh disabled - users can manually refresh if needed
    // Previous behavior: reloaded menu every 60s, causing loss of selection state
    return;

    /* Original code:
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      // Avoid overlapping requests if still loading
      if (this.loading()) return;
      this.loadMenu();
    }, this.REFRESH_INTERVAL_MS);
    */
  }

  manualRefresh() {
    const now = Date.now();
    if (now - this.lastRefresh < this.MIN_INTERVAL_BETWEEN_MANUAL_REFRESH_MS) {
      return; // debounce rapid clicks
    }
    this.lastRefresh = now;
    if (!this.loading()) {
      this.loadMenu();
    }
  }

  selectCategory(categoryId: string) {
    this.selectedCategory.set(categoryId);
  }

  getProductsForSelectedCategory(): PublicMenuItem[] {
    const categoryId = this.selectedCategory();
    if (!categoryId) return [];

    const categoryGroup = this.productsByCategory()[categoryId];

    // Flatten all products from all subcategories in this category
    const allProducts: PublicMenuItem[] = [];
    if (categoryGroup) {
      Object.values(categoryGroup).forEach((subcategoryProducts) => {
        allProducts.push(...(subcategoryProducts || []));
      });
    }

    return allProducts;
  }

  /**
   * Get the display price for a product based on price adjustments.
   * Returns the calculated price or null if price requires user selection (e.g., portion).
   */
  getProductPrice(product: PublicMenuItem): number | null {
    const categoryId = product.category?.id ?? (product as any).categoryId;
    const subcategoryId =
      product.subcategory?.id ?? (product as any).subcategoryId;

    if (!categoryId) {
      // No category, use base price
      return product.price || 0;
    }

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

    if (applicableAdjustments.length === 0) {
      // No adjustments found, check if there are portions for this category
      const hasPortions = sizes.some(
        (s) => s.categoryId === categoryId && s.isActive !== false,
      );
      // If there are portions but no adjustments, return null to indicate "varies by portion"
      if (hasPortions) return null;
      // Otherwise use base price
      return product.price || 0;
    }

    // Check if there's an adjustment WITHOUT a specific portion (applies to all)
    const generalAdjustment = applicableAdjustments.find(
      (adj) => !adj.productSizeId,
    );

    if (generalAdjustment) {
      // There's a general price adjustment without portion requirement
      const basePrice = product.price || 0;
      const price = generalAdjustment.isPercentage
        ? basePrice + basePrice * (generalAdjustment.amount / 100)
        : generalAdjustment.amount;
      return price;
    }

    // All adjustments require specific portions - return null to indicate "varies"
    const hasPortionAdjustments = applicableAdjustments.some(
      (adj) => adj.productSizeId,
    );
    if (hasPortionAdjustments) {
      return null;
    }

    return product.price || 0;
  }

  /**
   * Get portion prices for products that have variable pricing by portion.
   * Returns an array of portions with their calculated prices.
   */
  getPortionPrices(
    product: PublicMenuItem,
  ): Array<{ portionId: string; portionName: string; price: number }> {
    const categoryId = product.category?.id ?? (product as any).categoryId;
    const subcategoryId =
      product.subcategory?.id ?? (product as any).subcategoryId;

    if (!categoryId) return [];

    const adjustments = this.priceAdjustments();
    const sizes = this.productSizes();

    // Get portions for this category
    const categoryPortions = sizes.filter(
      (s) => s.categoryId === categoryId && s.isActive !== false,
    );

    if (categoryPortions.length === 0) return [];

    // Find applicable adjustments for this product
    const applicableAdjustments = adjustments.filter((adj) => {
      if (adj.categoryId !== categoryId) return false;
      if (adj.subcategoryId && adj.subcategoryId !== subcategoryId)
        return false;
      if (adj.productId && adj.productId !== product.id) return false;
      return true;
    });

    // Build portion prices
    return categoryPortions
      .map((portion) => {
        // Find adjustment specific to this portion
        const portionAdjustment = applicableAdjustments.find(
          (adj) => adj.productSizeId === portion.id,
        );

        if (!portionAdjustment) {
          // No specific adjustment for this portion - check for general adjustment
          const generalAdjustment = applicableAdjustments.find(
            (adj) => !adj.productSizeId,
          );
          if (generalAdjustment) {
            const basePrice = product.price || 0;
            const price = generalAdjustment.isPercentage
              ? basePrice + basePrice * (generalAdjustment.amount / 100)
              : generalAdjustment.amount;
            return { portionId: portion.id, portionName: portion.name, price };
          }
          return null; // No price defined for this portion
        }

        // Calculate price from portion adjustment
        const basePrice = product.price || 0;
        const price = portionAdjustment.isPercentage
          ? basePrice + basePrice * (portionAdjustment.amount / 100)
          : portionAdjustment.amount;

        return { portionId: portion.id, portionName: portion.name, price };
      })
      .filter((p) => p !== null) as Array<{
      portionId: string;
      portionName: string;
      price: number;
    }>;
  }

  /**
   * Add a product with a specific portion to the cart.
   */
  addPortionToCart(
    product: PublicMenuItem,
    portion: { portionId: string; portionName: string; price: number },
  ) {
    if (!this.canOrderFromPublicMenu()) return;
    const portionObj = { id: portion.portionId, name: portion.portionName };
    this.checkAndAddProduct(product, portion.price, portionObj);
  }

  // --- Bundles & Portions Logic (migrated from table-details) ---
  openPortionSelector(product: Product) {
    if (!this.canOrderFromPublicMenu()) return;
    const dialogRef = this.dialog.open(PortionSelectorModalComponent, {
      data: { product },
      panelClass: 'modal-center',
    });

    dialogRef.closed.subscribe((result: any) => {
      const portionResult = result;
      if (portionResult) {
        this.checkAndAddProduct(
          portionResult.product as any,
          portionResult.finalPrice,
          portionResult.selectedSize,
        );
      }
    });
  }

  private checkAndAddProduct(
    product: PublicMenuItem | Product,
    price: number,
    selectedSize: any = null,
  ): void {
    if (!this.canOrderFromPublicMenu()) return;
    this.bundleService.getBundles({ productId: product.id }).subscribe({
      next: (bundles: any[]) => {
        const activeBundle = bundles.find((b: any) => b.isActive);
        const hasDynamicGroups =
          activeBundle?.groups?.some((g: any) => g.useDynamicProduct) ?? false;

        if (hasDynamicGroups) {
          // Open bundle selection modal
          this.openBundleSelector(product as any, selectedSize, price);
        } else {
          // No dynamic groups, add directly
          this.cart.addSingle(
            product as any,
            selectedSize?.name || 'unico',
            price,
            selectedSize?.id,
            {
              categoryName: (product as any).category?.name || undefined,
              subcategoryName: (product as any).subcategory?.name || undefined,
            },
          );
        }
      },
      error: () => {
        // Add directly on error
        this.cart.addSingle(
          product as any,
          selectedSize?.name || 'unico',
          price,
          selectedSize?.id,
          {
            categoryName: (product as any).category?.name || undefined,
            subcategoryName: (product as any).subcategory?.name || undefined,
          },
        );
      },
    });
  }

  openBundleSelector(product: any, selectedSize: any, basePrice: number): void {
    if (!this.canOrderFromPublicMenu()) return;
    const dialogRef = this.dialog.open(BundleSelectionModalComponent, {
      data: { product, selectedSize, basePrice },
      panelClass: 'modal-center',
    });

    dialogRef.closed.subscribe((result: any) => {
      const bundleResult = result;
      if (bundleResult) {
        this.cart.addSingle(
          bundleResult.product as any,
          bundleResult.selectedSize?.name || 'unico',
          bundleResult.totalPrice,
          bundleResult.selectedSize?.id,
          {
            categoryName:
              (bundleResult.product as any).category?.name || undefined,
            subcategoryName:
              (bundleResult.product as any).subcategory?.name || undefined,
            bundleName: bundleResult.bundleName,
            bundleSelections: bundleResult.groupSelections,
          },
        );
      }
    });
  }

  // ===== Non-pizza variant (single modifier group) helpers =====
  private selectedModifierByProduct = signal<Record<string, string>>({});

  private getCandidateVariantGroup(
    product: PublicMenuItem,
  ): ProductModifierGroup | null {
    const groups = (product.modifierGroups || []).filter(
      (g) => g.isActive && g.modifierGroup,
    );
    if (groups.length === 0) return null;
    // Prefer groups with SINGLE selection (maxSelection === 1)
    const single = groups.find(
      (g) => (g.modifierGroup?.maxSelection ?? -1) === 1,
    );
    return single || groups[0];
  }

  getVariantOptions(product: PublicMenuItem): Array<{
    id: string;
    label: string;
    price: number;
    modifier: Modifier;
    group: ProductModifierGroup;
  }> {
    // Use calculated price as base, fallback to product.price
    const base = this.getProductPrice(product) ?? product.price ?? 0;
    const group = this.getCandidateVariantGroup(product);
    if (!group || !group.modifierGroup) return [];
    const mods = group.modifiers ?? group.modifierGroup.modifiers ?? [];
    return mods
      .filter((m) => m.isActive)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((m) => ({
        id: m.id,
        label: m.name,
        price: base + (m.priceAdjustment || 0),
        modifier: m,
        group,
      }));
  }

  getSelectedModifierIdFor(product: PublicMenuItem): string | null {
    const saved = this.selectedModifierByProduct()[product.id];
    if (saved) return saved;
    const options = this.getVariantOptions(product);
    return options[0]?.id ?? null;
  }

  selectVariant(productId: string, modifierId: string) {
    this.selectedModifierByProduct.update((cur) => ({
      ...cur,
      [productId]: modifierId,
    }));
  }

  // ===== Simple Product Cart =====
  addSimpleProductToCart(product: PublicMenuItem) {
    if (!this.canOrderFromPublicMenu()) return;
    // If the product has a single-choice variant group, use inline list
    const options = this.getVariantOptions(product);
    if (options.length > 0) {
      // Use selected option or default first
      const selectedId =
        this.getSelectedModifierIdFor(product) || options[0].id;
      const chosen = options.find((o) => o.id === selectedId) || options[0];
      if (!chosen) return;
      // Build modifier selection payload
      const mods: CartModifierSelection[] = [
        {
          groupId: chosen.group.modifierGroup!.id,
          groupName: chosen.group.modifierGroup!.name,
          modifierId: chosen.modifier.id,
          modifierName: chosen.modifier.name,
          priceAdjustment: chosen.modifier.priceAdjustment,
        },
      ];
      this.cart.addSingle(product, 'unico', chosen.price, undefined, {
        categoryName: product.category?.name || undefined,
        subcategoryName: product.subcategory?.name || undefined,
        modifiers: mods,
      });
      return;
    }

    // Otherwise open full modifier selector if there are modifier groups
    const hasModifiers =
      product.modifierGroups && product.modifierGroups.length > 0;
    if (hasModifiers) {
      this.openModifierSelector(product);
      return;
    }

    // Keep public-menu behavior aligned with table-details:
    // if pricing says a portion/size must be chosen, force the portion selector
    // before opening bundle selection so the resulting order item keeps its size.
    const resolvedPrice = this.getProductPrice(product);

    const productLike = {
      ...product,
      categoryId: product.category?.id ?? (product as any).categoryId,
      subcategoryId: product.subcategory?.id ?? (product as any).subcategoryId,
    } as any;

    if (resolvedPrice === null) {
      this.openPortionSelector(productLike);
      return;
    }

    // Default to seeing if product needs dynamic bundle
    this.checkAndAddProduct(productLike, resolvedPrice, null);
  }

  // ===== Modifier Selector Modal =====
  modifierOpen = signal(false);
  modifierProduct = signal<PublicMenuItem | null>(null);
  modifierSelections = signal<Map<string, Set<string>>>(new Map());

  openModifierSelector(product: PublicMenuItem) {
    if (!this.canOrderFromPublicMenu()) return;
    console.log('Opening modifier selector for product:', product);
    this.modifierProduct.set(product);
    this.modifierSelections.set(new Map());
    this.modifierOpen.set(true);

    // Debug: check what modifier groups we have
    setTimeout(() => {
      const groups = this.getModifierGroups();
      console.log('Modifier groups in modal:', groups);
    }, 100);
  }

  closeModifierSelector() {
    this.modifierOpen.set(false);
    this.modifierProduct.set(null);
    this.modifierSelections.set(new Map());
  }

  getModifierGroups(): ProductModifierGroup[] {
    const product = this.modifierProduct();
    console.log('Getting modifier groups for product:', product);
    if (!product?.modifierGroups) {
      console.log('No modifierGroups found');
      return [];
    }
    const filtered = product.modifierGroups
      .filter((pmg) => pmg.isActive && pmg.modifierGroup)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    console.log('Filtered modifier groups:', filtered);
    return filtered;
  }

  getSelectionType(group: ProductModifierGroup): 'SINGLE' | 'MULTIPLE' {
    const max = group.modifierGroup?.maxSelection ?? -1;
    return max === 1 ? 'SINGLE' : 'MULTIPLE';
  }

  isModifierSelectedInGroup(groupId: string, modifierId: string): boolean {
    const selections = this.modifierSelections();
    return selections.get(groupId)?.has(modifierId) ?? false;
  }

  toggleModifierSelection(pmg: ProductModifierGroup, modifier: Modifier) {
    if (!pmg.modifierGroup) return;

    const groupId = pmg.modifierGroup.id;
    const modifierId = modifier.id;
    const selectionType = this.getSelectionType(pmg);
    const max = pmg.modifierGroup.maxSelection;

    this.modifierSelections.update((current) => {
      const newMap = new Map(current);
      const groupSet = newMap.get(groupId) || new Set<string>();

      if (selectionType === 'SINGLE') {
        // Radio: clear all and select only this one
        newMap.set(groupId, new Set([modifierId]));
      } else {
        // Checkbox: toggle
        if (groupSet.has(modifierId)) {
          groupSet.delete(modifierId);
        } else {
          // Check max limit
          if (max > 0 && groupSet.size >= max) {
            return current; // Don't allow more selections
          }
          groupSet.add(modifierId);
        }
        newMap.set(groupId, groupSet);
      }

      return newMap;
    });
  }

  getModifierPrice(): number {
    const product = this.modifierProduct();
    if (!product) return 0;

    // Use calculated price from price adjustments, fallback to base price
    const basePrice = this.getProductPrice(product) ?? product.price ?? 0;
    let adjustments = 0;

    const selections = this.modifierSelections();
    const groups = this.getModifierGroups();

    for (const pmg of groups) {
      const mods = pmg.modifiers ?? pmg.modifierGroup?.modifiers ?? [];

      const selectedIds = selections.get(pmg.modifierGroup!.id);
      if (!selectedIds || selectedIds.size === 0) continue;

      for (const modifier of mods) {
        if (selectedIds.has(modifier.id)) {
          adjustments += modifier.priceAdjustment;
        }
      }
    }

    return basePrice + adjustments;
  }

  canAddToCartWithModifiers(): boolean {
    const groups = this.getModifierGroups();
    const selections = this.modifierSelections();

    for (const pmg of groups) {
      if (!pmg.modifierGroup) continue;

      const min = pmg.modifierGroup.minSelection;
      const selectedCount = selections.get(pmg.modifierGroup.id)?.size ?? 0;

      // Check if minimum selection is met for required groups
      if (pmg.modifierGroup.isRequired && selectedCount < min) {
        return false;
      }
    }

    return true;
  }

  addProductWithModifiersToCart() {
    const product = this.modifierProduct();
    if (!product || !this.canAddToCartWithModifiers()) return;

    const selections = this.modifierSelections();
    const groups = this.getModifierGroups();
    const modifiers: CartModifierSelection[] = [];

    for (const pmg of groups) {
      const mods = pmg.modifiers ?? pmg.modifierGroup?.modifiers ?? [];

      const selectedIds = selections.get(pmg.modifierGroup!.id);
      if (!selectedIds || selectedIds.size === 0) continue;

      for (const modifier of mods) {
        if (selectedIds.has(modifier.id)) {
          modifiers.push({
            groupId: pmg.modifierGroup!.id,
            groupName: pmg.modifierGroup!.name,
            modifierId: modifier.id,
            modifierName: modifier.name,
            priceAdjustment: modifier.priceAdjustment,
          });
        }
      }
    }

    const finalPrice = this.getModifierPrice();

    this.cart.addSingle(product, 'unico', finalPrice, undefined, {
      categoryName: product.category?.name || undefined,
      subcategoryName: product.subcategory?.name || undefined,
      modifiers,
    });

    this.closeModifierSelector();
  }
}
