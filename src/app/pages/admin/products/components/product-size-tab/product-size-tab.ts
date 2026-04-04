import { Component, inject, signal } from '@angular/core';
import { BranchSelectionService } from '../../../../../core/services/branch-selection.service';
import { Dialog } from '@angular/cdk/dialog';
import { CategoryService } from '../../../../../core/services/category.service';

import { FormsModule } from '@angular/forms';
import {
  ProductSize,
  ProductSizeService,
} from '../../../../../core/services/product-size.service';
import { ProductSizeFormComponent } from '../../modals/product-size-form/product-size-form.component';

@Component({
  selector: 'product-size-tab',
  imports: [FormsModule],
  templateUrl: './product-size-tab.html',
})
export class ProductSizeTab {
  branchSelectionService = inject(BranchSelectionService);
  private dialog = inject(Dialog);
  productSizeService = inject(ProductSizeService);
  private categoryService = inject(CategoryService);

  branchId = signal<string | null>(null);

  constructor() {
    const currentBranchId = this.branchSelectionService.selectedBranchId();
    if (currentBranchId) {
      this.branchId.set(currentBranchId);
    }
  }

  ngOnInit(): void {
    this.loadProductSizes();
  }

  loadProductSizes() {
    if (this.productSizeService.productSizes().length === 0) {
      this.productSizeService.forceRefresh();
    }
  }

  openProductSizeModal(productSize?: ProductSize) {
    const dialogRef = this.dialog.open(ProductSizeFormComponent, {
      width: '600px', // Ancho consistente con Subcategorías
      maxWidth: '95vw',
      panelClass: 'full-screen-modal', // Reusa nuestra clase global
      autoFocus: false,
      data: {
        productSize: productSize ? productSize : undefined,
      },
    });

    dialogRef.closed.subscribe((result) => {
      this.loadProductSizes();
    });
  }

  deleteProduct(productId: string) {
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (!branchId) return;
  }

  getCategoryName(categoryId: string): string {
    if (!categoryId) return 'Sin categoría';
    const category = this.categoryService
      .categories()
      .find((cat) => cat.id === categoryId);
    return category ? category.name : 'Desconocida';
  }

  getBranchName(branchId: string | null | undefined): string {
    const branch = this.branchSelectionService.getSelectedBranch();
    if (branchId === branch?.id) {
      return branch!.name;
    } else {
      return 'Todas las sucursales';
    }
  }
}
