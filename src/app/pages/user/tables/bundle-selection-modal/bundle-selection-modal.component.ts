import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { Product } from '../../../../core/services/product.service';
import {
  ProductSize,
  ProductSizeService,
} from '../../../../core/services/product-size.service';
import {
  ProductBundle,
  ProductBundleGroup,
  ProductBundleService,
} from '../../../../core/services/product-bundle.service';
import {
  DynamicProductFilterService,
  FilteredProduct,
} from '../../../../core/services/dynamic-product-filter.service';
import {
  BundlePriceCalculatorService,
  SelectedBundleItem,
} from '../../../../core/services/bundle-price-calculator.service';

export type BundleSelectionData = {
  product: Product;
  selectedSize?: ProductSize | null;
  basePrice: number;
};

export type BundleGroupSelection = {
  groupId: string;
  groupName: string;
  selectedProducts: {
    product: FilteredProduct;
    quantity: number;
  }[];
  calculatedPrice: number;
};

export type BundleSelectionResult = {
  product: Product;
  selectedSize?: ProductSize | null;
  basePrice: number;
  bundleName: string;
  groupSelections: BundleGroupSelection[];
  totalPrice: number;
  displayName: string;
};

type GroupState = {
  group: ProductBundleGroup;
  availableProducts: FilteredProduct[];
  selections: Map<string, number>; // productKey -> quantity
  isLoading: boolean;
  error?: string;
};

type SizeFilterOption = {
  id: string;
  label: string;
};

@Component({
  selector: 'app-bundle-selection-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      class="bg-base-100 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col"
    >
      <!-- Header -->
      <div class="flex-none p-4 bg-base-200/50 border-b border-base-200">
        <h2 class="text-lg font-bold text-base-content">
          Configurar {{ data.product.name }}
        </h2>
        @if (data.selectedSize) {
          <p class="text-sm text-base-content/60 mt-1">
            Tamaño: {{ data.selectedSize.name }}
          </p>
        }
        @if (activeBundle()) {
          <p class="text-xs text-primary mt-1">
            {{ activeBundle()?.name }}
          </p>
        }
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4">
        @if (isLoading()) {
          <div class="flex items-center justify-center py-8">
            <span class="loading loading-spinner loading-md"></span>
            <span class="ml-2 text-sm text-base-content/60">
              Cargando opciones...
            </span>
          </div>
        } @else if (!activeBundle()) {
          <div class="text-center py-6 text-base-content/60">
            <p>Este producto no tiene configuración de bundle.</p>
          </div>
        } @else {
          <div class="space-y-6">
            @for (gs of groupStates(); track gs.group.id || $index) {
              <div class="card bg-base-200/30 border border-base-200">
                <div class="card-body p-4">
                  <!-- Group Header -->
                  <div class="flex justify-between items-start mb-3">
                    <div>
                      <h3 class="font-bold text-base-content">
                        {{ gs.group.name }}
                      </h3>
                      <p class="text-xs text-base-content/60">
                        @if (
                          gs.group.minSelections && gs.group.minSelections > 0
                        ) {
                          Mín: {{ gs.group.minSelections }}
                        }
                        @if (gs.group.maxSelections) {
                          @if (
                            gs.group.minSelections && gs.group.minSelections > 0
                          ) {
                            •
                          }
                          Máx: {{ gs.group.maxSelections }}
                        }
                      </p>
                    </div>
                    @if (getGroupValidation(gs); as validation) {
                      <span
                        class="badge badge-sm"
                        [ngClass]="
                          validation.valid ? 'badge-success' : 'badge-warning'
                        "
                      >
                        {{ getSelectionCount(gs) }}/{{
                          gs.group.maxSelections || '∞'
                        }}
                      </span>
                    }
                  </div>

                  <!-- Loading state -->
                  @if (gs.isLoading) {
                    <div
                      class="flex items-center gap-2 py-4 justify-center text-base-content/60"
                    >
                      <span class="loading loading-spinner loading-sm"></span>
                      <span class="text-sm">Cargando productos...</span>
                    </div>
                  } @else if (getVisibleProducts(gs).length === 0) {
                    <div class="text-center py-4 text-base-content/50 text-sm">
                      No hay productos disponibles para este tamaño.
                    </div>
                  } @else {
                    @if (getSizeOptions(gs).length > 1) {
                      <div class="mb-3 flex flex-wrap gap-2">
                        @for (size of getSizeOptions(gs); track size.id) {
                          <button
                            type="button"
                            class="btn btn-xs"
                            [ngClass]="
                              selectedSizeForGroup(gs) === size.id
                                ? 'btn-primary'
                                : 'btn-outline'
                            "
                            (click)="selectSizeFilter(gs, size.id)"
                          >
                            {{ size.label }}
                          </button>
                        }
                      </div>
                    }
                    <!-- Products Grid -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      @for (
                        fp of getVisibleProducts(gs);
                        track getProductKey(fp)
                      ) {
                        @let selected = isProductSelected(gs, fp);
                        @let quantity = getProductQuantity(gs, fp);
                        <button
                          type="button"
                          class="p-3 rounded-xl border-2 transition-all text-left"
                          [ngClass]="
                            selected
                              ? 'border-primary bg-primary/5'
                              : 'border-base-300 hover:border-base-400 hover:bg-base-100'
                          "
                          (click)="toggleProduct(gs, fp)"
                          [disabled]="!canSelectMore(gs) && !selected"
                        >
                          <div class="flex justify-between items-center gap-2">
                            <div class="flex-1 min-w-0">
                              <p class="font-medium text-sm truncate">
                                {{ fp.product.name }}
                              </p>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                              @if (
                                selected && (gs.group.maxSelections ?? 1) > 1
                              ) {
                                <div class="flex items-center gap-1">
                                  <button
                                    type="button"
                                    class="btn btn-xs btn-circle btn-ghost"
                                    (click)="decrementQuantity($event, gs, fp)"
                                  >
                                    −
                                  </button>
                                  <span
                                    class="text-sm font-bold w-4 text-center"
                                  >
                                    {{ quantity }}
                                  </span>
                                  <button
                                    type="button"
                                    class="btn btn-xs btn-circle btn-ghost"
                                    (click)="incrementQuantity($event, gs, fp)"
                                    [disabled]="!canSelectMore(gs)"
                                  >
                                    +
                                  </button>
                                </div>
                              } @else if (selected) {
                                <span class="badge badge-primary badge-sm"
                                  >✓</span
                                >
                              }
                              <span class="font-bold text-primary text-sm">
                                {{ '$' + fp.price }}
                              </span>
                            </div>
                          </div>
                        </button>
                      }
                    </div>
                  }

                  <!-- Validation message -->
                  @if (getGroupValidation(gs); as validation) {
                    @if (!validation.valid && validation.message) {
                      <p class="text-xs text-warning mt-2">
                        {{ validation.message }}
                      </p>
                    }
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Footer with price summary -->
      <div class="flex-none p-4 bg-base-100 border-t border-base-200">
        <div class="flex flex-col gap-3">
          <!-- Price breakdown -->
          <div class="space-y-1 text-sm">
            <div class="flex justify-between text-base-content/70">
              <span>Precio base</span>
              <span>{{ '$' + data.basePrice }}</span>
            </div>
            @for (gs of groupStates(); track gs.group.id || $index) {
              @if (getGroupPrice(gs) > 0) {
                <div class="flex justify-between text-base-content/70">
                  <span>{{ gs.group.name }}</span>
                  <span>+{{ '$' + getGroupPrice(gs) }}</span>
                </div>
              }
            }
            <div class="divider my-1"></div>
            <div class="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span class="text-primary">{{ '$' + totalPrice() }}</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost" (click)="cancel()">Cancelar</button>
            <button
              class="btn btn-primary"
              [disabled]="!isValid()"
              (click)="confirm()"
            >
              Agregar al pedido
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class BundleSelectionModalComponent implements OnInit {
  private dialogRef = inject(DialogRef<BundleSelectionResult>);
  private bundleService = inject(ProductBundleService);
  private dynamicFilterService = inject(DynamicProductFilterService);
  private priceCalculatorService = inject(BundlePriceCalculatorService);
  private productSizeService = inject(ProductSizeService);

  readonly data: BundleSelectionData = inject(DIALOG_DATA);

  isLoading = signal(true);
  activeBundle = signal<ProductBundle | null>(null);
  groupStates = signal<GroupState[]>([]);
  selectedSizeByGroup = signal<Map<string, string>>(new Map());
  private productSizeNameById = signal<Map<string, string>>(new Map());

  totalPrice = computed(() => {
    let total = this.data.basePrice;
    for (const gs of this.groupStates()) {
      total += this.getGroupPrice(gs);
    }
    return Math.round(total * 100) / 100;
  });

  ngOnInit(): void {
    this.loadProductSizes();
    this.loadBundles();
  }

  private loadProductSizes(): void {
    this.productSizeService.getProductSizes().subscribe({
      next: (productSizes) => {
        const map = new Map<string, string>();
        for (const size of productSizes || []) {
          if (!size?.id) {
            continue;
          }
          const name = (size.name || '').trim();
          if (name.length > 0) {
            map.set(String(size.id), name);
          }
        }
        this.productSizeNameById.set(map);
      },
      error: (err) => {
        console.error(
          '[BundleSelectionModal] Error loading product sizes:',
          err,
        );
      },
    });
  }

  private loadBundles(): void {
    this.bundleService
      .getBundles({ productId: this.data.product.id })
      .subscribe({
        next: (bundles) => {
          // Find active bundle
          const active = bundles.find((b) => b.isActive);
          if (!active) {
            this.isLoading.set(false);
            return;
          }

          this.activeBundle.set(active);

          // Filter groups that use dynamic products
          const dynamicGroups = (active.groups || []).filter(
            (g) => g.useDynamicProduct,
          );

          if (dynamicGroups.length === 0) {
            this.isLoading.set(false);
            return;
          }

          // Initialize group states
          const states: GroupState[] = dynamicGroups.map((group) => ({
            group,
            availableProducts: [],
            selections: new Map<string, number>(),
            isLoading: true,
          }));
          this.groupStates.set(states);
          this.isLoading.set(false);

          // Load products for each group
          dynamicGroups.forEach((group, index) => {
            this.loadGroupProducts(group, index);
          });
        },
        error: (err) => {
          console.error('[BundleSelectionModal] Error loading bundles:', err);
          this.isLoading.set(false);
        },
      });
  }

  private loadGroupProducts(group: ProductBundleGroup, index: number): void {
    this.dynamicFilterService.getFilteredProductsWithPrices(group).subscribe({
      next: (products) => {
        const groupKey = this.getGroupKeyFromGroup(group);
        const defaultSizeId = this.resolveDefaultSizeId(products);

        this.selectedSizeByGroup.update((current) => {
          const next = new Map(current);
          if (defaultSizeId) {
            next.set(groupKey, defaultSizeId);
          } else {
            next.delete(groupKey);
          }
          return next;
        });

        this.groupStates.update((states) => {
          const updated = [...states];
          if (updated[index]) {
            updated[index] = {
              ...updated[index],
              availableProducts: products,
              isLoading: false,
            };
          }
          return updated;
        });
      },
      error: (err) => {
        console.error(
          '[BundleSelectionModal] Error loading group products:',
          err,
        );
        this.groupStates.update((states) => {
          const updated = [...states];
          if (updated[index]) {
            updated[index] = {
              ...updated[index],
              isLoading: false,
              error: 'Error al cargar productos',
            };
          }
          return updated;
        });
      },
    });
  }

  getProductKey(fp: FilteredProduct): string {
    return `${fp.product.id}_${fp.sizeId || 'default'}`;
  }

  getSizeOptions(gs: GroupState): SizeFilterOption[] {
    return this.getSizeOptionsFromProducts(gs.availableProducts);
  }

  selectedSizeForGroup(gs: GroupState): string | null {
    return this.selectedSizeByGroup().get(this.getGroupKey(gs)) || null;
  }

  getVisibleProducts(gs: GroupState): FilteredProduct[] {
    const options = this.getSizeOptions(gs);
    if (options.length === 0) {
      return gs.availableProducts;
    }

    const selectedSizeId = this.selectedSizeForGroup(gs) || options[0].id;
    return gs.availableProducts.filter((fp) => fp.sizeId === selectedSizeId);
  }

  selectSizeFilter(gs: GroupState, sizeId: string): void {
    const groupKey = this.getGroupKey(gs);

    this.selectedSizeByGroup.update((current) => {
      const next = new Map(current);
      next.set(groupKey, sizeId);
      return next;
    });

    this.groupStates.update((states) =>
      states.map((state) => {
        if (
          state.group.id !== gs.group.id &&
          state.group.name !== gs.group.name
        ) {
          return state;
        }

        const visibleKeys = new Set(
          state.availableProducts
            .filter((fp) => fp.sizeId === sizeId)
            .map((fp) => this.getProductKey(fp)),
        );

        const nextSelections = new Map<string, number>();
        state.selections.forEach((qty, key) => {
          if (visibleKeys.has(key)) {
            nextSelections.set(key, qty);
          }
        });

        return {
          ...state,
          selections: nextSelections,
        };
      }),
    );
  }

  private getGroupKey(gs: GroupState): string {
    return this.getGroupKeyFromGroup(gs.group);
  }

  private getGroupKeyFromGroup(group: ProductBundleGroup): string {
    return group.id || group.name;
  }

  private resolveDefaultSizeId(products: FilteredProduct[]): string | null {
    const options = this.getSizeOptionsFromProducts(products);
    if (options.length === 0) {
      return null;
    }

    const selectedSizeId = this.data.selectedSize?.id;
    if (
      selectedSizeId &&
      options.some((option) => option.id === selectedSizeId)
    ) {
      return selectedSizeId;
    }

    return options[0].id;
  }

  private getSizeOptionsFromProducts(
    products: FilteredProduct[],
  ): SizeFilterOption[] {
    const sizeMap = new Map<string, string>();

    for (const product of products) {
      if (!product.sizeId) {
        continue;
      }
      const sizeId = String(product.sizeId);
      if (!sizeMap.has(sizeId)) {
        sizeMap.set(sizeId, this.resolveSizeName(sizeId, product.sizeName));
      }
    }

    return Array.from(sizeMap.entries()).map(([id, label]) => ({ id, label }));
  }

  private resolveSizeName(sizeId: string, fallbackLabel?: string): string {
    const fromCache = this.productSizeNameById().get(String(sizeId));
    if (fromCache) {
      return fromCache;
    }

    const fallback = (fallbackLabel || '').trim();
    if (fallback.length > 0) {
      return fallback;
    }

    return 'Tamaño';
  }

  isProductSelected(gs: GroupState, fp: FilteredProduct): boolean {
    return gs.selections.has(this.getProductKey(fp));
  }

  getProductQuantity(gs: GroupState, fp: FilteredProduct): number {
    return gs.selections.get(this.getProductKey(fp)) || 0;
  }

  getSelectionCount(gs: GroupState): number {
    let count = 0;
    gs.selections.forEach((qty) => (count += qty));
    return count;
  }

  canSelectMore(gs: GroupState): boolean {
    const max = gs.group.maxSelections ?? Infinity;
    return this.getSelectionCount(gs) < max;
  }

  toggleProduct(gs: GroupState, fp: FilteredProduct): void {
    const key = this.getProductKey(fp);
    const current = gs.selections.get(key) || 0;

    this.groupStates.update((states) => {
      return states.map((s) => {
        if (s.group.id !== gs.group.id && s.group.name !== gs.group.name)
          return s;

        const newSelections = new Map(s.selections);
        if (current > 0) {
          newSelections.delete(key);
        } else if (this.canSelectMore(s)) {
          newSelections.set(key, 1);
        }

        return { ...s, selections: newSelections };
      });
    });
  }

  incrementQuantity(event: Event, gs: GroupState, fp: FilteredProduct): void {
    event.stopPropagation();
    if (!this.canSelectMore(gs)) return;

    const key = this.getProductKey(fp);
    this.groupStates.update((states) => {
      return states.map((s) => {
        if (s.group.id !== gs.group.id && s.group.name !== gs.group.name)
          return s;

        const newSelections = new Map(s.selections);
        const current = newSelections.get(key) || 0;
        newSelections.set(key, current + 1);

        return { ...s, selections: newSelections };
      });
    });
  }

  decrementQuantity(event: Event, gs: GroupState, fp: FilteredProduct): void {
    event.stopPropagation();
    const key = this.getProductKey(fp);

    this.groupStates.update((states) => {
      return states.map((s) => {
        if (s.group.id !== gs.group.id && s.group.name !== gs.group.name)
          return s;

        const newSelections = new Map(s.selections);
        const current = newSelections.get(key) || 0;
        if (current <= 1) {
          newSelections.delete(key);
        } else {
          newSelections.set(key, current - 1);
        }

        return { ...s, selections: newSelections };
      });
    });
  }

  getGroupValidation(gs: GroupState): { valid: boolean; message?: string } {
    return this.dynamicFilterService.validateSelection(
      gs.group,
      this.getSelectionCount(gs),
    );
  }

  getGroupPrice(gs: GroupState): number {
    const selectedItems: SelectedBundleItem[] = [];

    gs.selections.forEach((quantity, key) => {
      const fp = gs.availableProducts.find(
        (p) => this.getProductKey(p) === key,
      );
      if (fp) {
        selectedItems.push({
          productId: fp.product.id,
          productSizeId: fp.sizeId,
          price: fp.price,
          quantity,
        });
      }
    });

    if (selectedItems.length === 0) return 0;

    const result = this.priceCalculatorService.calculateGroupPrice(
      gs.group,
      selectedItems,
      this.data.basePrice,
    );

    return result.calculatedPrice;
  }

  isValid(): boolean {
    const states = this.groupStates();
    if (states.length === 0) return true;

    // All groups with min selections must be satisfied
    return states.every((gs) => this.getGroupValidation(gs).valid);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    if (!this.isValid()) return;

    const bundle = this.activeBundle();
    if (!bundle) {
      this.dialogRef.close();
      return;
    }

    // Build group selections
    const groupSelections: BundleGroupSelection[] = this.groupStates().map(
      (gs) => {
        const selectedProducts: {
          product: FilteredProduct;
          quantity: number;
        }[] = [];

        gs.selections.forEach((quantity, key) => {
          const fp = gs.availableProducts.find(
            (p) => this.getProductKey(p) === key,
          );
          if (fp) {
            selectedProducts.push({ product: fp, quantity });
          }
        });

        return {
          groupId: gs.group.id || '',
          groupName: gs.group.name,
          selectedProducts,
          calculatedPrice: this.getGroupPrice(gs),
        };
      },
    );

    // Build display name
    let displayName = this.data.product.name;
    if (this.data.selectedSize) {
      displayName += ` (${this.data.selectedSize.name})`;
    }

    // Add selected products to display name
    const selections = groupSelections
      .flatMap((gs) => gs.selectedProducts.map((sp) => sp.product.product.name))
      .join(' + ');

    if (selections) {
      displayName += ` - ${selections}`;
    }

    const result: BundleSelectionResult = {
      product: this.data.product,
      selectedSize: this.data.selectedSize,
      basePrice: this.data.basePrice,
      bundleName: bundle.name,
      groupSelections,
      totalPrice: this.totalPrice(),
      displayName,
    };

    this.dialogRef.close(result);
  }
}
