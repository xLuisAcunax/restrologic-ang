import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Product } from '../../../../core/services/product.service';
import {
  ProductSize,
  ProductSizeService,
} from '../../../../core/services/product-size.service';
import {
  PriceAdjustment,
  PriceAdjustmentService,
} from '../../../../core/services/price-adjustment.service';
import { forkJoin, map, switchMap, of } from 'rxjs';
import { ProductBundleService, ProductBundleGroup } from '../../../../core/services/product-bundle.service';

export type PortionSelectorData = {
  product: Product;
};

export type PortionSelectorResult = {
  product: Product;
  selectedSize: ProductSize | null;
  finalPrice: number;
  displayName: string;
};

type PortionOption = {
  size: ProductSize;
  price: number;
};

@Component({
  selector: 'app-portion-selector-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="bg-base-100 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
    >
      <!-- Header -->
      <div class="p-4 bg-base-200/50 border-b border-base-200">
        <h2 class="text-lg font-bold text-base-content">Seleccionar porción</h2>
        <p class="text-sm text-base-content/60 mt-1">
          {{ data.product.name }}
        </p>
      </div>

      <!-- Content -->
      <div class="p-4">
        @if (isLoading()) {
          <div class="flex items-center justify-center py-8">
            <span class="loading loading-spinner loading-md"></span>
            <span class="ml-2 text-sm text-base-content/60"
              >Cargando porciones...</span
            >
          </div>
        } @else if (portionOptions().length === 0) {
          <div class="text-center py-6 text-base-content/60">
            <p>No hay porciones disponibles para este producto.</p>
          </div>
        } @else {
          <div class="space-y-2">
            @for (option of portionOptions(); track option.size.id) {
              <button
                class="w-full p-4 rounded-xl border-2 transition-all text-left flex justify-between items-center"
                [ngClass]="
                  isOptionSelected(option)
                    ? 'border-primary bg-primary/5'
                    : 'border-base-200 hover:border-base-300 hover:bg-base-50'
                "
                (click)="selectOption(option)"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0"
                    [ngClass]="
                      isOptionSelected(option)
                        ? 'border-primary bg-primary'
                        : 'border-base-300'
                    "
                  >
                    @if (isOptionSelected(option)) {
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3 w-3 text-white"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    }
                  </div>
                  <span class="font-medium text-base-content">{{
                    option.size.name
                  }}</span>
                </div>
                <span class="font-bold text-primary">
                  {{ '$' + (option.price | number: '1.0-0') }}
                </span>
              </button>
            }
          </div>
        }
      </div>

      <!-- Footer -->
      <div
        class="p-4 bg-base-100 border-t border-base-200 flex justify-end gap-2"
      >
        <button class="btn btn-ghost" (click)="cancel()">Cancelar</button>
        <button
          class="btn btn-primary"
          [disabled]="!selectedOption()"
          (click)="confirm()"
        >
          Agregar
        </button>
      </div>
    </div>
  `,
})
export class PortionSelectorModalComponent implements OnInit {
  private dialogRef = inject(DialogRef<PortionSelectorResult>);
  private productSizeService = inject(ProductSizeService);
  private priceAdjustmentService = inject(PriceAdjustmentService);
  private bundleService = inject(ProductBundleService);

  readonly data: PortionSelectorData = inject(DIALOG_DATA);

  isLoading = signal(true);
  portionOptions = signal<PortionOption[]>([]);
  selectedOption = signal<PortionOption | null>(null);

  ngOnInit(): void {
    this.loadPortionsForCategory();
  }

  private loadPortionsForCategory(): void {
    const categoryId = this.data.product.categoryId;
    const subcategoryId = this.data.product.subcategoryId;

    if (!categoryId) {
      this.isLoading.set(false);
      return;
    }

    // Load product sizes, price adjustments, and product bundles in parallel
    forkJoin({
      sizes: this.productSizeService.getProductSizes(),
      adjustments: this.priceAdjustmentService.getPriceAdjustments({
        categoryId,
        onlyActive: true,
      }),
      bundles: this.bundleService.getBundles({ productId: this.data.product.id }),
    }).subscribe({
      next: ({ sizes, adjustments, bundles }) => {
        // Filter sizes by category (consider active if isActive is not explicitly false)
        let categorySizes = (sizes || []).filter(
          (s) => s.categoryId === categoryId && s.isActive !== false,
        );

        // Check for active bundles with dynamic groups that have size restrictions
        const activeBundle = bundles.find((b) => b.isActive);
        if (activeBundle && activeBundle.groups) {
          const dynamicGroups = activeBundle.groups.filter((g) => g.useDynamicProduct);
          if (dynamicGroups.length > 0) {
            // Check if ANY dynamic group allows all sizes (no size restriction)
            const hasUnrestrictedGroup = dynamicGroups.some(
              (g) => !g.scopeProductSizeIds || g.scopeProductSizeIds.length === 0
            );

            if (!hasUnrestrictedGroup) {
              // All dynamic groups have size restrictions. Collect allowed sizes.
              const allowedSizeIds = new Set<string>();
              dynamicGroups.forEach((g) => {
                if (g.scopeProductSizeIds) {
                  g.scopeProductSizeIds.forEach((id) => allowedSizeIds.add(id));
                }
              });

              // Filter categorySizes to only include sizes allowed by the bundles
              categorySizes = categorySizes.filter((s) => allowedSizeIds.has(s.id));
            }
          }
        }

        // Build options with calculated prices
        const options: PortionOption[] = categorySizes.map((size) => {
          const price = this.calculatePrice(
            size,
            adjustments || [],
            categoryId,
            subcategoryId,
          );
          return { size, price };
        });

        this.portionOptions.set(options);
        this.isLoading.set(false);
      },
      error: () => {
        this.portionOptions.set([]);
        this.isLoading.set(false);
      },
    });
  }

  private calculatePrice(
    size: ProductSize,
    adjustments: PriceAdjustment[],
    categoryId: string,
    subcategoryId?: string | null,
  ): number {
    // Find the most specific price adjustment for this size
    // Priority: productId > subcategoryId + sizeId > categoryId + sizeId
    let adjustment = adjustments.find(
      (a) =>
        a.productSizeId === size.id &&
        a.productId === this.data.product.id &&
        a.isActive,
    );

    if (!adjustment && subcategoryId) {
      adjustment = adjustments.find(
        (a) =>
          a.productSizeId === size.id &&
          a.subcategoryId === subcategoryId &&
          !a.productId &&
          a.isActive,
      );
    }

    if (!adjustment) {
      adjustment = adjustments.find(
        (a) =>
          a.productSizeId === size.id &&
          a.categoryId === categoryId &&
          !a.subcategoryId &&
          !a.productId &&
          a.isActive,
      );
    }

    if (adjustment) {
      if (adjustment.isPercentage) {
        return (
          this.data.product.price +
          this.data.product.price * (adjustment.amount / 100)
        );
      }
      return adjustment.amount;
    }

    // If no adjustment found, use the size's priceAdjustment if available, otherwise base price
    if (size.priceAdjustment !== undefined && size.priceAdjustment !== null) {
      return size.priceAdjustment;
    }

    return this.data.product.price;
  }

  isOptionSelected(option: PortionOption): boolean {
    const selected = this.selectedOption();
    return selected !== null && selected.size.id === option.size.id;
  }

  selectOption(option: PortionOption): void {
    this.selectedOption.set(option);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    const option = this.selectedOption();
    if (!option) return;

    const result: PortionSelectorResult = {
      product: this.data.product,
      selectedSize: option.size,
      finalPrice: option.price,
      displayName: `${this.data.product.name} (${option.size.name})`,
    };

    this.dialogRef.close(result);
  }
}
