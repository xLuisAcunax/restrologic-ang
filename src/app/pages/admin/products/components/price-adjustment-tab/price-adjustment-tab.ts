import { Component, effect, inject, signal } from '@angular/core';
import {
  Subcategory,
  SubcategoryService,
} from '../../../../../core/services/subcategory.service';
import { BranchSelectionService } from '../../../../../core/services/branch-selection.service';
import { PriceAdjustmentFormComponent } from '../../modals/price-adjustment-form/price-adjustment-form.component';
import { Dialog } from '@angular/cdk/dialog';
import { CategoryService } from '../../../../../core/services/category.service';
import {
  PriceAdjustment,
  PriceAdjustmentService,
} from '../../../../../core/services/price-adjustment.service';
import { ProductSizeService } from '../../../../../core/services/product-size.service';
import { ProductService } from '../../../../../core/services/product.service';
import { CurrencyPipe } from '@angular/common';

@Component({
  selector: 'price-adjustment-tab',
  imports: [CurrencyPipe],
  templateUrl: './price-adjustment-tab.html',
})
export class PriceAdjustmentsTab {
  priceAdjustmentService = inject(PriceAdjustmentService);
  private branchSelectionService = inject(BranchSelectionService);
  private categoryService = inject(CategoryService);
  private subcategoryService = inject(SubcategoryService);
  private productSizeService = inject(ProductSizeService);
  private productService = inject(ProductService);
  private dialog = inject(Dialog);

  branchId = signal<string>('');

  constructor() {
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (branchId) {
      this.branchId.set(branchId);
    }

    this.priceAdjustmentService.loadPriceAdjustmentsIfNeeded();

    this.loadConfigurations();
    effect(() => {
      if (this.categoryService.categories().length === 0) {
        this.categoryService.forceRefresh();
      }
    });
  }

  openPriceAdjustmentModal(priceAdjustment?: PriceAdjustment) {
    const dialogRef = this.dialog.open(PriceAdjustmentFormComponent, {
      width: '800px', // Un poco más ancho para que los selects se vean bien
      maxWidth: '95vw',
      panelClass: 'full-screen-modal',
      autoFocus: false,
      data: {
        priceAdjustment,
      },
    });

    dialogRef.closed.subscribe((result) => {
      if (result === 'Confirmed') {
        this.loadConfigurations();
      }
    });
  }

  loadConfigurations() {
    if (this.subcategoryService.subcategories().length === 0) {
      this.subcategoryService.forceRefresh();
    }

    if (this.productSizeService.productSizes().length === 0) {
      this.productSizeService.forceRefresh();
    }
  }

  getCategoryName(categoryId: string) {
    if (!categoryId) return '—';
    return (
      this.categoryService.categories().find((c) => c.id === categoryId)
        ?.name ?? '—'
    );
  }

  getSubcategoryName(subcategoryId: string) {
    if (!subcategoryId) return '—';
    return (
      this.subcategoryService
        .subcategories()
        .find((c) => c.id === subcategoryId)?.name ?? '—'
    );
  }

  getProductSizeName(productSizeId: string) {
    if (!productSizeId) return '—';
    return (
      this.productSizeService
        .productSizes()
        .find((ps) => ps.id === productSizeId)?.name ?? '—'
    );
  }

  getProductName(productId: string) {
    if (!productId) return '—';
    return (
      this.productService.products().find((ps) => ps.id === productId)?.name ??
      '—'
    );
  }

  deletePriceAdjustment(priceAdjustment: PriceAdjustment) {
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (!branchId) return;

    const confirmed = confirm(
      `¿Estás seguro de eliminar éste ajuste de precio ?`,
    );

    if (!confirmed) {
      return;
    }

    this.priceAdjustmentService
      .deletePriceAdjustment(priceAdjustment.id)
      .subscribe(() => this.loadConfigurations());
  }
}
