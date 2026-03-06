import { CommonModule } from '@angular/common';
import { Component, Inject, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { AuthService } from '../../../../../core/services/auth.service';
import {
  getProductTypeEnumKeys,
  ProductTypeEnum,
} from '../../../../../core/enums/product-type.enum';
import {
  CreateProductDto,
  Product,
  ProductService,
  UpdateProductDto,
} from '../../../../../core/services/product.service';
import {
  Category,
  CategoryService,
} from '../../../../../core/services/category.service';
import {
  CreateSubcategoryDto,
  Subcategory,
  SubcategoryService,
  UpdateSubcategoryDto,
} from '../../../../../core/services/subcategory.service';

@Component({
  selector: 'app-subcategory-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './subcategory-form.component.html',
})
export class SubcategoryFormComponent implements OnInit {
  me = inject(AuthService).me;
  subcategoryService = inject(SubcategoryService);
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
      subcategory?: Subcategory | undefined;
    },
  ) {}

  ngOnInit(): void {
    if (this.data.subcategory) {
      this.form.patchValue({
        name: this.data.subcategory.name,
        priceAdjustment: this.data.subcategory.priceAdjustment,
        categoryId: this.data.subcategory.categoryId,
        isActive: this.data.subcategory.isActive,
      });
    }
  }

  onSaving() {
    if (!this.form.valid) {
      return;
    }

    const request$ = this.data.subcategory
      ? this.subcategoryService.updateSubcategory(
          this.mapSubcategoryToUpdateDto(),
          this.data.subcategory.id,
        )
      : this.subcategoryService.createSubcategory(
          this.mapSubcategoryToUpdateDto() as CreateSubcategoryDto,
        );

    request$.subscribe(() => {
      this.dialogRef.close('Confirmed');
    });
  }

  mapSubcategoryToUpdateDto(): UpdateSubcategoryDto {
    const formValue = this.form.getRawValue(); // Get disabled fields too
    return {
      name: formValue.name ?? this.data.subcategory?.name!,
      priceAdjustment:
        formValue.priceAdjustment ?? this.data.subcategory?.priceAdjustment!,
      categoryId: formValue.categoryId ?? this.data.subcategory?.categoryId!,
      isActive: formValue.isActive!,
    };
  }
}
