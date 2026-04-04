
import { Component, Inject, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { AuthService } from '../../../../../core/services/auth.service';
import {
  Category,
  CategoryService,
  CreateCategoryDto,
  UpdateCategoryDto,
} from '../../../../../core/services/category.service';

@Component({
  selector: 'app-category-form',
  imports: [ReactiveFormsModule],
  templateUrl: './category-form.component.html',
})
export class CategoryFormComponent implements OnInit {
  me = inject(AuthService).me;
  private categoryService = inject(CategoryService);

  form = new FormBuilder().group({
    name: ['', Validators.required],
    isActive: true,
  });

  constructor(
    public dialogRef: DialogRef<string>, // Specify the return type when closing
    @Inject(DIALOG_DATA)
    public data: {
      category?: Category;
    }, // Adjust the type as needed
  ) {}

  ngOnInit(): void {
    if (this.data.category) {
      this.form.patchValue({
        name: this.data.category.name,
        isActive: this.data.category.isActive,
      });
    }
  }

  onSaving() {
    if (!this.form.valid) {
      return;
    }

    const request$ = this.data.category
      ? this.categoryService.updateCategory(
          this.mapCategoryToUpdateDto(),
          this.data.category.id,
        )
      : this.categoryService.createCategory(
          this.mapCategoryToCreationDto() as CreateCategoryDto,
        );

    request$.subscribe(() => {
      this.dialogRef.close('Confirmed');
    });
  }

  mapCategoryToCreationDto() {
    return {
      name: this.form.value.name,
      createdBy: this.me()?.id || '',
      isActive: this.form.value.isActive ?? true,
    };
  }

  mapCategoryToUpdateDto(): UpdateCategoryDto {
    return {
      name: this.form.value.name ?? this.data.category?.name,
      isActive: this.form.value.isActive ?? this.data.category?.isActive,
      createdBy: this.me()?.id || '',
    };
  }
}
