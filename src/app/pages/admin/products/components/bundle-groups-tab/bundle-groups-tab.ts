import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import {
  ProductBundle,
  ProductBundleGroup,
  ProductBundleService,
} from '../../../../../core/services/product-bundle.service';
import { ProductBundleGroupFormComponent } from '../../modals/product-bundle-group-form/product-bundle-group-form.component';
import {
  Product,
  ProductService,
} from '../../../../../core/services/product.service';
import { BranchSelectionService } from '../../../../../core/services/branch-selection.service';

@Component({
  selector: 'bundle-groups-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bundle-groups-tab.html',
})
export class BundleGroupsTab implements OnInit {
  private dialog = inject(Dialog);
  private bundleService = inject(ProductBundleService);
  private productService = inject(ProductService);
  private branchSelectionService = inject(BranchSelectionService);

  bundles = signal<ProductBundle[]>([]);
  selectedBundleId = signal<string>('');
  selectedBundle = signal<ProductBundle | null>(null);
  products = signal<Product[]>([]);
  isLoading = signal<boolean>(false);

  ngOnInit(): void {
    this.loadProducts();
    this.loadBundles();
  }

  loadBundles() {
    this.isLoading.set(true);
    this.bundleService.getBundles().subscribe({
      next: (bundles) => {
        const list = bundles || [];
        this.bundles.set(list);
        if (!this.selectedBundleId() && list.length > 0) {
          this.selectBundle(list[0].id);
        }
      },
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

  selectBundle(bundleId: string) {
    this.selectedBundleId.set(bundleId);
    if (!bundleId) {
      this.selectedBundle.set(null);
      return;
    }
    this.bundleService.getBundle(bundleId).subscribe((bundle) => {
      this.selectedBundle.set(bundle || null);
    });
  }

  getProductName(productId: string): string {
    const product = this.products().find((p) => p.id === productId);
    return product?.name || productId;
  }

  getGroups(): ProductBundleGroup[] {
    const bundle = this.selectedBundle();
    if (!bundle?.groups) return [];
    return [...bundle.groups].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
  }

  openGroupModal(group?: ProductBundleGroup, groupIndex?: number) {
    const bundle = this.selectedBundle();
    if (!bundle) return;

    const dialogRef = this.dialog.open(ProductBundleGroupFormComponent, {
      width: '1000px',
      maxWidth: '95vw',
      panelClass: 'full-screen-modal',
      autoFocus: false,
      data: { bundle, group, groupIndex },
    });

    dialogRef.closed.subscribe((result) => {
      if (result === 'Confirmed') {
        this.selectBundle(bundle.id);
      }
    });
  }

  deleteGroup(group: ProductBundleGroup) {
    const bundle = this.selectedBundle();
    if (!bundle) return;
    const confirmed = confirm(
      `¿Estás seguro de eliminar el grupo "${group.name}"?`,
    );
    if (!confirmed) return;

    const nextGroups = (bundle.groups || []).filter((g) => g !== group);
    this.bundleService
      .updateBundle(bundle.id, {
        productId: bundle.productId,
        name: bundle.name,
        description: bundle.description ?? null,
        kind: bundle.kind,
        isActive: bundle.isActive,
        groups: nextGroups,
      })
      .subscribe(() => {
        this.selectBundle(bundle.id);
      });
  }
}
