
import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { AuthService } from '../../../../../core/services/auth.service';
import { CategoryService } from '../../../../../core/services/category.service';
import {
  Subcategory,
  SubcategoryService,
} from '../../../../../core/services/subcategory.service';
import {
  CreatePriceAdjustmentDto,
  PriceAdjustment,
  PriceAdjustmentService,
  UpdatePriceAdjustmentDto,
} from '../../../../../core/services/price-adjustment.service';
import {
  ProductSize,
  ProductSizeService,
} from '../../../../../core/services/product-size.service';
import {
  Product,
  ProductService,
} from '../../../../../core/services/product.service';

@Component({
  selector: 'app-price-adjustment-form',
  imports: [ReactiveFormsModule],
  templateUrl: './price-adjustment-form.component.html',
})
export class PriceAdjustmentFormComponent implements OnInit {
  me = inject(AuthService).me;
  categoryService = inject(CategoryService);
  subcategoryService = inject(SubcategoryService);
  priceAdjustmentService = inject(PriceAdjustmentService);
  productSizeService = inject(ProductSizeService);
  productService = inject(ProductService);

  allSubcategories = signal<Subcategory[]>([]);
  filteredSubcategories = signal<Subcategory[]>([]);
  filteredProductSizes = signal<ProductSize[]>([]);
  filteredProducts = signal<Product[]>([]);

  form = new FormBuilder().group({
    categoryId: ['', Validators.required],
    subcategoryId: [{ value: '', disabled: true }],
    productSizeId: [{ value: '', disabled: true }],
    productId: [{ value: '', disabled: true }],
    amount: [0, [Validators.required]],
    isPercentage: [false, Validators.required],
    isActive: [true, Validators.required],
  });

  constructor(
    public dialogRef: DialogRef<string>,
    @Inject(DIALOG_DATA)
    public data: {
      priceAdjustment?: PriceAdjustment;
    },
  ) {}

  ngOnInit(): void {
    if (this.data.priceAdjustment?.categoryId) {
      this.form.controls.categoryId.setValue(
        this.data.priceAdjustment.categoryId,
      );
    }

    this.allSubcategories.set(this.subcategoryService.subcategories());
    this.updateFilteredSubcategories();

    // Load product sizes
    this.updateFilteredProductSizes();

    // React to category changes to enable/disable and filter dependent selects
    this.form.controls.categoryId.valueChanges.subscribe((categoryId) => {
      const hasCategory = !!categoryId;
      if (hasCategory) {
        this.form.controls.subcategoryId.enable({ emitEvent: false });
        this.form.controls.productSizeId.enable({ emitEvent: false });
        this.form.controls.productId.enable({ emitEvent: false });
      } else {
        this.form.controls.subcategoryId.disable({ emitEvent: false });
        this.form.controls.subcategoryId.setValue('', { emitEvent: false });
        this.form.controls.productSizeId.disable({ emitEvent: false });
        this.form.controls.productSizeId.setValue('', { emitEvent: false });
        this.form.controls.productId.disable({ emitEvent: false });
        this.form.controls.productId.setValue('', { emitEvent: false });
      }
      this.updateFilteredSubcategories();
      this.updateFilteredProductSizes();
      // Fetch products by category when no subcategory selected
      if (hasCategory) {
        this.productService
          .getProductsWithFilters({
            categoryId: categoryId || undefined,
            onlyActive: true,
          })
          .subscribe((prods: Product[]) => this.filteredProducts.set(prods));
      } else {
        this.filteredProducts.set([]);
      }
    });

    // React to subcategory changes to fetch products by subcategory
    this.form.controls.subcategoryId.valueChanges.subscribe((subcategoryId) => {
      const sid = subcategoryId || '';
      const cid = (this.form.controls.categoryId.value as string) || '';
      if (sid) {
        this.productService
          .getProductsWithFilters({
            subcategoryId: sid,
            onlyActive: true,
          })
          .subscribe((prods: Product[]) => this.filteredProducts.set(prods));
      } else if (cid) {
        this.productService
          .getProductsWithFilters({
            categoryId: cid,
            onlyActive: true,
          })
          .subscribe((prods: Product[]) => this.filteredProducts.set(prods));
      } else {
        this.filteredProducts.set([]);
      }
    });

    // If editing, patch existing values
    if (this.data.priceAdjustment) {
      const pa = this.data.priceAdjustment;
      this.form.patchValue({
        categoryId: pa.categoryId || '',
        subcategoryId: pa.subcategoryId || '',
        productSizeId: pa.productSizeId || '',
        productId: pa.productId || '',
        amount: pa.amount,
        isPercentage: pa.isPercentage,
        isActive: pa.isActive,
      });

      // Ensure controls are enabled if category exists
      if (pa.categoryId) {
        this.form.controls.subcategoryId.enable({ emitEvent: false });
        this.form.controls.productSizeId.enable({ emitEvent: false });
        this.form.controls.productId.enable({ emitEvent: false });
      }
      this.updateFilteredSubcategories();
      this.updateFilteredProductSizes();
    }
  }

  onSaving() {
    if (!this.form.valid) return;

    const action$ = this.data.priceAdjustment
      ? this.priceAdjustmentService.updatePriceAdjustment(
          this.data.priceAdjustment.id,
          this.mapToUpdateDto(),
        )
      : this.priceAdjustmentService.createPriceAdjustment(
          this.mapToCreateDto(),
        );

    action$.subscribe(() => this.dialogRef.close('Confirmed'));
  }

  private mapToCreateDto(): CreatePriceAdjustmentDto {
    return {
      categoryId: this.form.value.categoryId || undefined,
      subcategoryId: this.form.value.subcategoryId || undefined,
      productSizeId: this.form.value.productSizeId || undefined,
      productId: this.form.value.productId || undefined,
      amount: Number(this.form.value.amount ?? 0),
      isPercentage: !!this.form.value.isPercentage,
      isActive:
        typeof this.form.value.isActive === 'string'
          ? this.form.value.isActive === 'true'
          : !!this.form.value.isActive,
    };
  }

  private mapToUpdateDto(): UpdatePriceAdjustmentDto {
    return {
      amount: Number(this.form.value.amount ?? 0),
      isPercentage: !!this.form.value.isPercentage,
      isActive:
        typeof this.form.value.isActive === 'string'
          ? this.form.value.isActive === 'true'
          : !!this.form.value.isActive,
    };
  }

  private updateFilteredSubcategories() {
    const categoryId = this.form.controls.categoryId.value as string | null;
    if (!categoryId) {
      this.filteredSubcategories.set([]);
      return;
    }
    const filtered = this.allSubcategories().filter(
      (s) => s.categoryId === categoryId,
    );
    this.filteredSubcategories.set(filtered);
  }

  private updateFilteredProductSizes() {
    const categoryId = this.form.controls.categoryId.value as string | null;
    if (!categoryId) {
      this.filteredProductSizes.set([]);
      return;
    }
    const filtered = this.productSizeService
      .productSizes()
      .filter((ps) => ps.categoryId === categoryId);
    this.filteredProductSizes.set(filtered);
  }
}
