import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  effect,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  BranchSummary,
  BusinessService,
} from '../../../core/services/business.service';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';
import { FormsModule } from '@angular/forms';
import { ProductsTab } from './components/products-tab/products-tab';
import { CategoriesTab } from './components/categories-tab/categories-tab';
import { PriceAdjustmentsTab } from './components/price-adjustment-tab/price-adjustment-tab';
import { SubcategoriesTab } from './components/subcategories-tab/subcategories-tab';
import { CategoryService } from '../../../core/services/category.service';
import { ProductSizeTab } from './components/product-size-tab/product-size-tab';
import { BundlesTab } from './components/bundles-tab/bundles-tab';
import { BundleGroupsTab } from './components/bundle-groups-tab/bundle-groups-tab';

@Component({
  selector: 'app-products',
  imports: [
    CommonModule,
    FormsModule,
    ProductsTab,
    CategoriesTab,
    PriceAdjustmentsTab,
    ProductSizeTab,
    SubcategoriesTab,
    BundlesTab,
    BundleGroupsTab,
  ],
  templateUrl: './products.component.html',
})
export class ProductsComponent implements OnInit, OnDestroy {
  // UI state
  activeTab = signal<
    | 'products'
    | 'categories'
    | 'priceAdjustments'
    | 'subcategories'
    | 'sizes'
    | 'bundles'
    | 'bundleGroups'
  >('products');
  private productChangeSub?: Subscription;
  private tenantService = inject(BusinessService);
  tenantId = signal<string>('');
  selectedBranch = signal<BranchSummary | null>(null);
  authService = inject(AuthService);
  businessService = inject(BusinessService);
  categoryService = inject(CategoryService);

  me = signal<any>(null);
  branches = signal<BranchSummary[]>([]);

  private branchSelectionService = inject(BranchSelectionService);

  constructor() {
    // Effect para reaccionar a cambios en la selección de sucursal
    effect(() => {
      const branchId = this.branchSelectionService.selectedBranchId();
      if (branchId) {
        this.loadBranchData(branchId);
      }
    });

    effect(() => {
      if (this.categoryService.categories().length === 0) {
        this.categoryService.forceRefresh();
      }
    });
  }

  ngOnInit(): void {
    this.tenantId.set(this.authService.me()?.tenantId!);
    if (this.tenantId()) this.loadBranches();
    this.load();
  }

  ngOnDestroy(): void {
    this.productChangeSub?.unsubscribe();
  }

  private loadBranchData(branchId: string) {
    this.tenantService.getBranch(branchId).subscribe((branch) => {
      this.selectedBranch.set(branch);
    });
  }

  loadBranches() {
    this.tenantService.getBranches().subscribe((branches) => {
      this.branches.set(branches);
    });
  }

  load() {
    this.businessService.getBranches().subscribe({
      next: (b) => {
        this.branches.set(b || []);
      },
      error: (err) => {
        console.error(err);
      },
    });
  }
}
