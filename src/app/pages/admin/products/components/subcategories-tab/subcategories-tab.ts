import { Component, inject, OnInit, signal } from '@angular/core';
import { BranchSelectionService } from '../../../../../core/services/branch-selection.service';
import { Dialog } from '@angular/cdk/dialog';
import {
  Category,
  CategoryService,
} from '../../../../../core/services/category.service';

import { FormsModule } from '@angular/forms';
import { SubcategoryFormComponent } from '../../modals/subcategory-form/subcategory-form.component';
import {
  Subcategory,
  SubcategoryService,
} from '../../../../../core/services/subcategory.service';

@Component({
  selector: 'subcategories-tab',
  imports: [FormsModule],
  templateUrl: './subcategories-tab.html',
})
export class SubcategoriesTab implements OnInit {
  branchSelectionService = inject(BranchSelectionService);
  private dialog = inject(Dialog);
  subcategoryService = inject(SubcategoryService);
  private categoryService = inject(CategoryService);

  branchId = signal<string | null>(null);

  constructor() {
    const currentBranchId = this.branchSelectionService.selectedBranchId();
    if (currentBranchId) {
      this.branchId.set(currentBranchId);
    }
  }

  ngOnInit(): void {
    this.loadSubcategories();
  }

  loadSubcategories() {
    if (this.subcategoryService.subcategories().length === 0) {
      this.subcategoryService.forceRefresh();
    }
  }

  openSubcategoryModal(subcategory?: Subcategory) {
    const dialogRef = this.dialog.open(SubcategoryFormComponent, {
      width: '600px', // Ancho perfecto para 2 columnas
      maxWidth: '95vw',
      panelClass: 'full-screen-modal', // Reusa nuestra clase mágica
      autoFocus: false,
      data: {
        subcategory: subcategory ? subcategory : undefined,
      },
    });

    dialogRef.closed.subscribe((result) => {
      this.loadSubcategories();
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
