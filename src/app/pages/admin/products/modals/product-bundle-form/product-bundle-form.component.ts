import { CommonModule } from '@angular/common';
import { Component, Inject, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ProductBundle,
  ProductBundleKind,
  ProductBundleService,
} from '../../../../../core/services/product-bundle.service';
import {
  Product,
  ProductService,
} from '../../../../../core/services/product.service';
import { BranchSelectionService } from '../../../../../core/services/branch-selection.service';

@Component({
  selector: 'product-bundle-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './product-bundle-form.component.html',
})
export class ProductBundleFormComponent implements OnInit {
  private bundleService = inject(ProductBundleService);
  private productService = inject(ProductService);
  private branchSelectionService = inject(BranchSelectionService);

  products = signal<Product[]>([]);

  form = new FormBuilder().group({
    productId: ['', Validators.required],
    name: ['', Validators.required],
    description: [''],
    kind: [ProductBundleKind.Combo as number],
    isActive: true,
  });

  constructor(
    public dialogRef: DialogRef<string>,
    @Inject(DIALOG_DATA)
    public data: {
      bundle?: ProductBundle;
    },
  ) {}

  ngOnInit(): void {
    this.loadProducts();

    if (this.data.bundle) {
      this.form.patchValue({
        productId: this.data.bundle.productId,
        name: this.data.bundle.name,
        description: this.data.bundle.description ?? '',
        kind: this.parseKind(this.data.bundle.kind),
        isActive: this.data.bundle.isActive,
      });
    }
  }

  /**
   * Convierte el kind del backend (string o número) al valor numérico del enum
   */
  parseKind(value: any): number {
    if (value === null || value === undefined) {
      return ProductBundleKind.Combo;
    }
    if (typeof value === 'number') {
      return value;
    }
    const mapping: Record<string, number> = {
      Combo: ProductBundleKind.Combo,
      Portioned: ProductBundleKind.Portioned,
      Choice: ProductBundleKind.Choice,
    };
    return mapping[value] ?? ProductBundleKind.Combo;
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

  onSaving() {
    if (!this.form.valid) return;

    const formValue = this.form.getRawValue();
    const groups = this.data.bundle?.groups ?? [];

    const dto = {
      productId: formValue.productId!,
      name: formValue.name!,
      description: formValue.description || null,
      kind: formValue.kind || undefined,
      isActive: formValue.isActive ?? true,
      groups,
    };

    const request$ = this.data.bundle?.id
      ? this.bundleService.updateBundle(this.data.bundle.id, dto)
      : this.bundleService.createBundle(dto);

    request$.subscribe(() => {
      this.dialogRef.close('Confirmed');
    });
  }
}
