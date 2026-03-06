import { Component, inject, signal, OnInit } from '@angular/core';
import {
  Product,
  ProductService,
} from '../../../../../core/services/product.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BranchSelectionService } from '../../../../../core/services/branch-selection.service';
import { ProductFormComponent } from '../../modals/product-form/product-form.component';
import { Dialog } from '@angular/cdk/dialog';
import { CategoryService } from '../../../../../core/services/category.service';
import { SubcategoryService } from '../../../../../core/services/subcategory.service';
import { ProductSizeService } from '../../../../../core/services/product-size.service';
import { ProductTypeService } from '../../../../../core/services/product-type.service';

@Component({
  selector: 'products-tab',
  imports: [CommonModule, FormsModule],
  templateUrl: './products-tab.html',
})
export class ProductsTab implements OnInit {
  branchSelectionService = inject(BranchSelectionService);
  private dialog = inject(Dialog);
  productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private subcategoryService = inject(SubcategoryService);
  private productSizeService = inject(ProductSizeService);
  private productTypeService = inject(ProductTypeService);

  branchId = signal<string | null>(null);

  constructor() {
    const currentBranchId = this.branchSelectionService.selectedBranchId();
    if (currentBranchId) {
      this.branchId.set(currentBranchId);
    }
    this.categoryService.forceRefresh();
    this.subcategoryService.forceRefresh();
    this.productTypeService.forceRefresh();
  }

  ngOnInit(): void {
    this.loadProducts(this.branchId()!);
  }

  loadProducts(branchId: string) {
    if (this.productService.products().length === 0) {
      this.productService.forceRefresh();
    }
  }

  // openProductModal(product?: Product) {
  //   const branchId = this.branchSelectionService.getEffectiveBranchId();
  //   if (!branchId) return;

  //   const dialogRef = this.dialog.open(ProductFormComponent, {
  //     width: '600px',
  //     data: {
  //       branchId: branchId,
  //       product: product ? product : undefined,
  //     },
  //   });

  //   dialogRef.closed.subscribe((result) => {
  //     this.loadProducts(branchId);
  //   });
  // }
  openProductModal(product?: Product) {
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (!branchId) return;

    const dialogRef = this.dialog.open(ProductFormComponent, {
      width: '900px',
      maxWidth: '95vw',
      maxHeight: '90vh', // IMPORTANTE: Limita la altura para que no se salga de la pantalla
      panelClass: 'full-screen-modal', // Opcional: para estilos globales si los tienes
      autoFocus: false,
      data: {
        branchId: branchId,
        product: product ? product : undefined,
      },
    });

    dialogRef.closed.subscribe((result) => {
      this.loadProducts(branchId);
    });
  }

  deleteProduct(productId: string) {
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (!branchId) return;

    this.productService.deleteProduct(productId).subscribe(() => {
      this.loadProducts(branchId);
    });
  }

  getCategoryName(categoryId: string): string {
    if (!categoryId) return '—';
    const category = this.categoryService
      .categories()
      .find((c) => c.id === categoryId);
    return category ? category.name : '—';
  }

  getSubcategoryName(subcategoryId: string): string {
    if (!subcategoryId) return '—';
    const subcategory = this.subcategoryService
      .subcategories()
      .find((sc) => sc.id === subcategoryId);
    return subcategory ? subcategory.name : '—';
  }

  getProductSizeName(productSizeId: string): string {
    if (!productSizeId) return '—';
    const productSize = this.productSizeService
      .productSizes()
      .find((ps) => ps.id === productSizeId);
    return productSize ? productSize.name : '—';
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
