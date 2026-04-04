
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import {
  ProductBundle,
  ProductBundleService,
} from '../../../../../core/services/product-bundle.service';
import {
  Product,
  ProductService,
} from '../../../../../core/services/product.service';
import { BranchSelectionService } from '../../../../../core/services/branch-selection.service';
import { ProductBundleFormComponent } from '../../modals/product-bundle-form/product-bundle-form.component';

@Component({
  selector: 'bundles-tab',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './bundles-tab.html',
})
export class BundlesTab implements OnInit {
  private dialog = inject(Dialog);
  private bundleService = inject(ProductBundleService);
  private productService = inject(ProductService);
  private branchSelectionService = inject(BranchSelectionService);

  bundles = signal<ProductBundle[]>([]);
  products = signal<Product[]>([]);
  isLoading = signal<boolean>(false);

  ngOnInit(): void {
    this.loadProducts();
    this.loadBundles();
  }

  loadBundles() {
    this.isLoading.set(true);
    this.bundleService.getBundles().subscribe({
      next: (bundles) => this.bundles.set(bundles || []),
      error: () => this.bundles.set([]),
      complete: () => this.isLoading.set(false),
    });
  }

  loadProducts() {
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    this.productService
      .getProductsWithFilters({
        branchId: branchId || undefined,
        onlyActive: true,
      })
      .subscribe((products) => this.products.set(products || []));
  }

  getProductName(productId: string): string {
    const product = this.products().find((p) => p.id === productId);
    return product?.name || productId;
  }

  openBundleModal(bundle?: ProductBundle) {
    const dialogRef = this.dialog.open(ProductBundleFormComponent, {
      width: '900px',
      maxWidth: '95vw',
      panelClass: 'full-screen-modal',
      autoFocus: false,
      data: { bundle },
    });

    dialogRef.closed.subscribe((result) => {
      if (result === 'Confirmed') {
        this.loadBundles();
      }
    });
  }

  deleteBundle(bundle: ProductBundle) {
    const confirmed = confirm(
      `¿Estás seguro de eliminar el modificador "${bundle.name}"?`,
    );
    if (!confirmed) return;

    this.bundleService.deleteBundle(bundle.id).subscribe(() => {
      this.loadBundles();
    });
  }
}
