import { Component, inject, OnInit, signal } from '@angular/core';
import { BranchSelectionService } from '../../../../../core/services/branch-selection.service';
import { Dialog } from '@angular/cdk/dialog';
import { CategoryFormComponent } from '../../modals/category-form/category-form.component';
import {
  Category,
  CategoryService,
  UpdateCategoryDto,
} from '../../../../../core/services/category.service';

@Component({
  selector: 'categories-tab',
  imports: [],
  templateUrl: './categories-tab.html',
})
export class CategoriesTab implements OnInit {
  private branchSelectionService = inject(BranchSelectionService);
  private dialog = inject(Dialog);
  categoryService = inject(CategoryService);

  tenantId = signal<string>('');

  ngOnInit(): void {
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (branchId) {
      this.tenantId.set(this.branchSelectionService.selectedBranch()!.id);
    }
    // Cargar categorías solo si no hay datos
    this.categoryService.loadCategoriesIfNeeded();
  }

  openCategoryModal(category?: Category) {
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (!branchId) return;

    const dialogRef = this.dialog.open(CategoryFormComponent, {
      width: '500px',
      maxWidth: '95vw',
      // height: 'auto', // Deja que se ajuste al contenido
      panelClass: 'full-screen-modal',
      autoFocus: false,
      data: {
        tenantId: this.tenantId(),
        branchId: branchId,
        category,
      },
    });

    dialogRef.closed.subscribe((result) => {
      if (result === 'Confirmed') {
        this.loadCategories();
      }
    });
  }

  loadCategories() {
    this.categoryService.forceRefresh();
  }

  toggleCategoryStatus(category: Category, isActive: boolean) {
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (!branchId) return;

    const dto: UpdateCategoryDto = {
      name: category.name,
      isActive,
    };

    this.categoryService
      .updateCategory(dto, category.id)
      .subscribe(() => this.loadCategories());
  }

  deleteCategory(category: Category) {
    const branchId = this.branchSelectionService.getEffectiveBranchId();
    if (!branchId) return;

    const confirmed = confirm(
      `¿Estás seguro de eliminar la categoría "${category.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    this.categoryService
      .deleteCategory(category.id)
      .subscribe(() => this.loadCategories());
  }
}
