import { CommonModule } from '@angular/common';
import { Component, Inject, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { AuthService } from '../../../../../core/services/auth.service';
import { CategoryService } from '../../../../../core/services/category.service';
import {
  CreateProductSizeDto,
  ProductSize,
  ProductSizeService,
  UpdateProductSizeDto,
} from '../../../../../core/services/product-size.service';

@Component({
  selector: 'product-size-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './product-size-form.component.html',
})
export class ProductSizeFormComponent implements OnInit {
  me = inject(AuthService).me;
  productSizeService = inject(ProductSizeService);
  categoryService = inject(CategoryService);

  form = new FormBuilder().group({
    name: ['', Validators.required],
    priceAdjustment: [0, [Validators.required, Validators.min(0)]],
    categoryId: [''],
    isActive: true,
  });

  constructor(
    public dialogRef: DialogRef<string>, // Specify the return type when closing
    @Inject(DIALOG_DATA)
    public data: {
      productSize?: ProductSize | undefined;
    },
  ) {}

  ngOnInit(): void {
    if (this.data.productSize) {
      this.form.patchValue({
        name: this.data.productSize.name,
        priceAdjustment: this.data.productSize.priceAdjustment,
        categoryId: this.data.productSize.categoryId,
        isActive: this.data.productSize.isActive,
      });
    }
  }

  onSaving() {
    if (!this.form.valid) {
      return;
    }
    console.log('data: ', this.data);

    const request$ = this.data.productSize
      ? this.productSizeService.updateProductSize(
          this.mapProductSizeToUpdateDto(),
          this.data.productSize.id,
        )
      : this.productSizeService.createProductSize(
          this.mapProductSizeToUpdateDto() as CreateProductSizeDto,
        );

    request$.subscribe(() => {
      this.dialogRef.close('Confirmed');
    });
  }

  mapProductSizeToUpdateDto(): UpdateProductSizeDto {
    const formValue = this.form.getRawValue(); // Get disabled fields too
    return {
      name: formValue.name ?? this.data.productSize?.name!,
      priceAdjustment:
        formValue.priceAdjustment ?? this.data.productSize?.priceAdjustment!,
      categoryId: formValue.categoryId ?? this.data.productSize?.categoryId!,
      isActive: formValue.isActive!,
    };
  }
}
