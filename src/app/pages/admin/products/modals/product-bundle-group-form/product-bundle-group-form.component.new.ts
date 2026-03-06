import { CommonModule } from '@angular/common';
import {
  Component,
  Inject,
  OnInit,
  OnDestroy,
  inject,
  signal,
  effect,
  computed,
  EffectRef,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ProductBundle,
  ProductBundleGroup,
  ProductBundleItem,
  ProductBundlePriceMode,
  ProductBundleService,
} from '../../../../../core/services/product-bundle.service';
import { CategoryService } from '../../../../../core/services/category.service';
import { SubcategoryService } from '../../../../../core/services/subcategory.service';
import { ProductSizeService } from '../../../../../core/services/product-size.service';
import { ProductTypeService } from '../../../../../core/services/product-type.service';
import {
  Product,
  ProductService,
} from '../../../../../core/services/product.service';
import { BranchSelectionService } from '../../../../../core/services/branch-selection.service';

@Component({
  selector: 'product-bundle-group-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './product-bundle-group-form.component.html',
})
export class ProductBundleGroupFormComponent implements OnInit, OnDestroy {
  private bundleService = inject(ProductBundleService);
  categoryService = inject(CategoryService);
  subcategoryService = inject(SubcategoryService);
  productSizeService = inject(ProductSizeService);
  productTypeService = inject(ProductTypeService);
  private productService = inject(ProductService);
  private branchSelectionService = inject(BranchSelectionService);
  private fb = inject(FormBuilder);

  products = signal<Product[]>([]);
  scopeCategoryIdsSignal = signal<string[]>([]);
  private effectCleanup?: EffectRef;

  filteredSubcategories = computed(() => {
    const selectedCategoryIds = this.scopeCategoryIdsSignal();
    if (!selectedCategoryIds || selectedCategoryIds.length === 0) {
      return [];
    }
    return this.subcategoryService
      .subcategories()
      .filter(
        (sub) =>
          String(sub.categoryId) === String(selectedCategoryIds[0]) ||
          selectedCategoryIds.includes(String(sub.categoryId)),
      );
  });

  filteredProductSizes = computed(() => {
    const selectedCategoryIds = this.scopeCategoryIdsSignal();
    if (!selectedCategoryIds || selectedCategoryIds.length === 0) {
      return this.productSizeService.productSizes();
    }
    return this.productSizeService
      .productSizes()
      .filter(
        (size) =>
          !size.categoryId ||
          selectedCategoryIds.some(
            (catId) => String(size.categoryId) === String(catId),
          ),
      );
  });

  form = this.fb.group({
    name: ['', Validators.required],
    minSelections: [1, [Validators.min(0)]],
    maxSelections: [1, [Validators.min(0)]],
    sortOrder: [1, [Validators.min(0)]],
    useCatalogScope: false,
    allowCustomSizes: false,
    priceMode: [ProductBundlePriceMode.SumAllPrices],
    priceOverride: [null as number | null],
    scopeCategoryIds: [[] as string[]],
    scopeSubcategoryIds: [[] as string[]],
    scopeProductTypeIds: [[] as string[]],
    scopeProductSizeIds: [[] as string[]],
    items: this.fb.array([]),
  });

  constructor(
    public dialogRef: DialogRef<string>,
    @Inject(DIALOG_DATA)
    public data: {
      bundle: ProductBundle;
      group?: ProductBundleGroup;
      groupIndex?: number;
    },
  ) {}

  ngOnInit(): void {
    // Cargar datos de servicios
    this.categoryService.forceRefresh();
    this.subcategoryService.forceRefresh();
    this.productSizeService.forceRefresh();
    this.productTypeService.forceRefresh();
    this.loadProducts();

    // Cargar datos del grupo si existe
    if (this.data.group) {
      const categoryIds = this.data.group.scopeCategoryIds ?? [];
      const normalizedCategoryIds = categoryIds.map((id) => String(id));

      this.form.patchValue({
        name: this.data.group.name,
        minSelections: this.data.group.minSelections ?? 1,
        maxSelections: this.data.group.maxSelections ?? 1,
        sortOrder: this.data.group.sortOrder ?? 1,
        useCatalogScope: this.data.group.useDynamicProduct,
        priceMode: this.parsePriceMode(this.data.group.priceMode),
        priceOverride: this.data.group.priceOverride ?? null,
        scopeCategoryIds: normalizedCategoryIds,
        scopeSubcategoryIds: (this.data.group.scopeSubcategoryIds ?? []).map(
          (id) => String(id),
        ),
        scopeProductTypeIds: (this.data.group.scopeProductTypeIds ?? []).map(
          (id) => String(id),
        ),
        scopeProductSizeIds: (this.data.group.scopeProductSizeIds ?? []).map(
          (id) => String(id),
        ),
      });

      // Actualizar el signal con los valores cargados
      this.scopeCategoryIdsSignal.set(normalizedCategoryIds);

      (this.data.group.items || []).forEach((item) => this.addItem(item));
    }

    if (!this.data.group && this.items.length === 0) {
      this.addItem();
    }
  }

  ngOnDestroy(): void {
    if (this.effectCleanup) {
      this.effectCleanup.destroy();
    }
  }

  /**
   * Se llama cuando el usuario cambia la selección de categorías
   * Actualiza el signal para que los computed se re-evalúen
   */
  onCategoriesChange(): void {
    const selectedCategoryIds = this.form.get('scopeCategoryIds')?.value || [];
    const normalized = selectedCategoryIds.map((id: any) => String(id));

    // Actualizar el signal - esto dispara los computed signals
    this.scopeCategoryIdsSignal.set(normalized);

    // Auto-limpiar subcategorías si no hay categorías seleccionadas
    if (!normalized || normalized.length === 0) {
      this.form.patchValue({ scopeSubcategoryIds: [] }, { emitEvent: false });
    }
  }

  onUseCatalogScopeChange(): void {
    const useCatalogScope = this.form.get('useCatalogScope')?.value;
    if (useCatalogScope) {
      // Limpiar items al usar filtros dinámicos
      this.items.clear();
    } else {
      // Agregar un item vacío si no hay ninguno
      if (this.items.length === 0) {
        this.addItem();
      }
    }
  }

  /**
   * Verifica si un valor está seleccionado en el array del formulario
   * Comparación segura entre tipos (string vs número)
   */
  isSelected(formControlName: string, value: any): boolean {
    const formValue = this.form.get(formControlName)?.value || [];
    return formValue.some((v: any) => String(v) === String(value));
  }

  /**
   * Convierte un valor a string de manera segura
   */
  toString(value: any): string {
    return String(value);
  }

  /**
   * Convierte el priceMode del backend (string o número) al valor numérico del enum
   */
  parsePriceMode(value: any): number {
    if (value === null || value === undefined) {
      return ProductBundlePriceMode.SumAllPrices;
    }
    // Si ya es número, devolverlo
    if (typeof value === 'number') {
      return value;
    }
    // Mapear string a número
    const mapping: Record<string, number> = {
      SumAllPrices: ProductBundlePriceMode.SumAllPrices,
      HighestPrice: ProductBundlePriceMode.HighestPrice,
      LowestPrice: ProductBundlePriceMode.LowestPrice,
      AveragePrice: ProductBundlePriceMode.AveragePrice,
      FirstItemPrice: ProductBundlePriceMode.FirstItemPrice,
      LastItemPrice: ProductBundlePriceMode.LastItemPrice,
      BaseProductPrice: ProductBundlePriceMode.BaseProductPrice,
    };
    return mapping[value] ?? ProductBundlePriceMode.SumAllPrices;
  }

  get items(): FormArray {
    return this.form.get('items') as FormArray;
  }

  addItem(item?: ProductBundleItem) {
    this.items.push(
      this.fb.group({
        productId: [item?.productId || '', Validators.required],
        productSizeId: [item?.productSizeId || null],
        quantity: [item?.quantity ?? 1, [Validators.min(1)]],
        priceOverride: [item?.priceOverride ?? (null as number | null)],
        sortOrder: [item?.sortOrder ?? this.items.length + 1],
      }),
    );
  }

  removeItem(index: number) {
    this.items.removeAt(index);
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

    const value = this.form.getRawValue();
    const useCatalogScope = !!value.useCatalogScope;

    const group: ProductBundleGroup = {
      id: this.data.group?.id,
      name: value.name!,
      minSelections: Number(value.minSelections ?? 0),
      maxSelections: Number(value.maxSelections ?? 0),
      sortOrder: Number(value.sortOrder ?? 0),
      useDynamicProduct: useCatalogScope,
      priceMode: value.priceMode ?? ProductBundlePriceMode.SumAllPrices,
      priceOverride: value.priceOverride ?? null,
      scopeCategoryIds: useCatalogScope ? value.scopeCategoryIds || [] : [],
      scopeSubcategoryIds: useCatalogScope
        ? value.scopeSubcategoryIds || []
        : [],
      scopeProductTypeIds: useCatalogScope
        ? value.scopeProductTypeIds || []
        : [],
      scopeProductSizeIds: useCatalogScope
        ? value.scopeProductSizeIds || []
        : [],
      items: useCatalogScope
        ? []
        : (value.items || []).map((item: any, index: number) => ({
            productId: item.productId,
            productSizeId: item.productSizeId || null,
            quantity: Number(item.quantity ?? 1),
            priceOverride: item.priceOverride ?? null,
            sortOrder: Number(item.sortOrder ?? index + 1),
          })),
    };

    const existingGroups = this.data.bundle.groups || [];
    const nextGroups = [...existingGroups];

    if (this.data.group) {
      const idx =
        this.data.groupIndex ??
        nextGroups.findIndex((g) => g.id && g.id === this.data.group?.id);
      if (idx >= 0) {
        nextGroups[idx] = group;
      } else {
        nextGroups.push(group);
      }
    } else {
      nextGroups.push(group);
    }

    this.bundleService
      .updateBundle(this.data.bundle.id, {
        productId: this.data.bundle.productId,
        name: this.data.bundle.name,
        description: this.data.bundle.description ?? null,
        kind: this.data.bundle.kind,
        isActive: this.data.bundle.isActive,
        groups: nextGroups,
      })
      .subscribe(() => {
        this.dialogRef.close('Confirmed');
      });
  }
}
