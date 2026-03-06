import { Injectable, inject, computed, Signal, signal } from '@angular/core';
import { forkJoin, map, Observable, of } from 'rxjs';
import { ProductBundleGroup } from './product-bundle.service';
import { Product, ProductService } from './product.service';
import { CategoryService } from './category.service';
import { SubcategoryService } from './subcategory.service';
import { ProductTypeService } from './product-type.service';
import { ProductSizeService } from './product-size.service';
import {
  PriceAdjustment,
  PriceAdjustmentService,
} from './price-adjustment.service';
import { BranchSelectionService } from './branch-selection.service';

/**
 * Producto filtrado con información de precio
 */
export interface FilteredProduct {
  product: Product;
  /** Tamaño seleccionado (si aplica) */
  sizeId?: string;
  sizeName?: string;
  /** Precio del producto para el tamaño específico */
  price: number;
  /** Información adicional */
  categoryName?: string;
  subcategoryName?: string;
}

/**
 * Servicio para filtrar productos dinámicamente según la configuración
 * de un grupo de modificadores (scopes)
 */
@Injectable({ providedIn: 'root' })
export class DynamicProductFilterService {
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private subcategoryService = inject(SubcategoryService);
  private productTypeService = inject(ProductTypeService);
  private productSizeService = inject(ProductSizeService);
  private priceAdjustmentService = inject(PriceAdjustmentService);
  private branchSelectionService = inject(BranchSelectionService);

  /**
   * Filtra productos según la configuración de scopes del grupo
   * @param group Grupo de modificadores con scopes configurados
   * @param allProducts Lista de todos los productos disponibles
   * @returns Productos que cumplen con los filtros del scope
   */
  filterProductsByScope(
    group: ProductBundleGroup,
    allProducts: Product[],
  ): Product[] {
    if (!group.useDynamicProduct) {
      return [];
    }

    let filtered = [...allProducts];

    // Filtrar por categorías
    if (group.scopeCategoryIds && group.scopeCategoryIds.length > 0) {
      const categoryIds = group.scopeCategoryIds.map((id) => String(id));
      filtered = filtered.filter((p) =>
        categoryIds.includes(String(p.categoryId)),
      );
    }

    // Filtrar por subcategorías
    if (group.scopeSubcategoryIds && group.scopeSubcategoryIds.length > 0) {
      const subcategoryIds = group.scopeSubcategoryIds.map((id) => String(id));
      filtered = filtered.filter(
        (p) =>
          p.subcategoryId && subcategoryIds.includes(String(p.subcategoryId)),
      );
    }

    // Filtrar por tipos de producto
    if (group.scopeProductTypeIds && group.scopeProductTypeIds.length > 0) {
      const typeIds = group.scopeProductTypeIds.map((id) => String(id));
      filtered = filtered.filter(
        (p) => p.productTypeId && typeIds.includes(String(p.productTypeId)),
      );
    }

    return filtered;
  }

  /**
   * Obtiene productos filtrados con sus precios para un tamaño específico
   * @param group Grupo de modificadores
   * @param sizeId ID del tamaño a considerar (opcional)
   * @returns Observable con productos filtrados y precios
   */
  getFilteredProductsWithPrices(
    group: ProductBundleGroup,
    sizeId?: string,
  ): Observable<FilteredProduct[]> {
    const branchId = this.branchSelectionService.getEffectiveBranchId();

    return forkJoin({
      products: this.productService.getProductsWithFilters({
        branchId: branchId || undefined,
        onlyActive: true,
      }),
      priceAdjustments: this.priceAdjustmentService.getPriceAdjustments(),
      categories: of(this.categoryService.categories()),
      subcategories: of(this.subcategoryService.subcategories()),
      sizes: of(this.productSizeService.productSizes()),
    }).pipe(
      map(
        ({ products, priceAdjustments, categories, subcategories, sizes }) => {
          // Filtrar productos según scope
          const filteredProducts = this.filterProductsByScope(
            group,
            products || [],
          );

          // Determinar qué tamaños usar
          const targetSizeIds =
            sizeId && sizeId !== ''
              ? [sizeId]
              : group.scopeProductSizeIds &&
                  group.scopeProductSizeIds.length > 0
                ? group.scopeProductSizeIds
                : [];

          const result: FilteredProduct[] = [];

          for (const product of filteredProducts) {
            // Si hay tamaños específicos, crear entrada por cada tamaño
            if (targetSizeIds.length > 0) {
              for (const szId of targetSizeIds) {
                const price = this.getProductPrice(
                  product,
                  String(szId),
                  priceAdjustments,
                );
                const size = sizes.find((s) => String(s.id) === String(szId));
                const category = categories.find(
                  (c) => String(c.id) === String(product.categoryId),
                );
                const subcategory = subcategories.find(
                  (s) => String(s.id) === String(product.subcategoryId),
                );

                result.push({
                  product,
                  sizeId: String(szId),
                  sizeName: size?.name,
                  price,
                  categoryName: category?.name,
                  subcategoryName: subcategory?.name,
                });
              }
            } else {
              // Sin tamaño específico, usar precio base
              const price = this.getProductPrice(
                product,
                undefined,
                priceAdjustments,
              );
              const category = categories.find(
                (c) => String(c.id) === String(product.categoryId),
              );
              const subcategory = subcategories.find(
                (s) => String(s.id) === String(product.subcategoryId),
              );

              result.push({
                product,
                price,
                categoryName: category?.name,
                subcategoryName: subcategory?.name,
              });
            }
          }

          return result;
        },
      ),
    );
  }

  /**
   * Obtiene el precio de un producto considerando ajustes de precio
   * Los ajustes de precio típicos tienen: categoryId + subcategoryId + productSizeId
   * Ejemplo: Pizzas > Tradicional > Mediana = $39,000
   */
  private getProductPrice(
    product: Product,
    sizeId: string | undefined,
    priceAdjustments: PriceAdjustment[],
  ): number {
    // Buscar ajustes que apliquen a este producto
    const applicableAdjustments = priceAdjustments.filter((pa) => {
      if (!pa.isActive) return false;

      // El ajuste debe coincidir con la categoría del producto (si tiene categoryId)
      if (
        pa.categoryId &&
        String(pa.categoryId) !== String(product.categoryId)
      ) {
        return false;
      }

      // Si el ajuste tiene subcategoryId, debe coincidir con el producto
      if (
        pa.subcategoryId &&
        String(pa.subcategoryId) !== String(product.subcategoryId)
      ) {
        return false;
      }

      // Si el ajuste tiene productId, debe coincidir
      if (pa.productId && String(pa.productId) !== String(product.id)) {
        return false;
      }

      // Si el ajuste tiene productSizeId, debe coincidir con el tamaño solicitado
      if (pa.productSizeId) {
        if (!sizeId || String(pa.productSizeId) !== String(sizeId)) {
          return false;
        }
      }

      return true;
    });

    // Ordenar por especificidad (más específico primero)
    // Prioridad: productId+sizeId > productId > subcategoryId+sizeId > categoryId+sizeId > sizeId > subcategoryId > categoryId
    const sortedAdjustments = applicableAdjustments.sort((a, b) => {
      const priorityA = this.getAdjustmentPriority(a);
      const priorityB = this.getAdjustmentPriority(b);
      return priorityB - priorityA;
    });

    console.log(
      '[getProductPrice]',
      product.name,
      'sizeId:',
      sizeId,
      'applicable:',
      sortedAdjustments.map((a) => ({
        cat: a.categoryId,
        sub: a.subcategoryId,
        size: a.productSizeId,
        amount: a.amount,
        priority: this.getAdjustmentPriority(a),
      })),
    );

    // Aplicar el ajuste más específico encontrado
    if (sortedAdjustments.length > 0) {
      const adjustment = sortedAdjustments[0];
      if (adjustment.isPercentage) {
        const basePrice = product.price ?? 0;
        return Math.max(
          0,
          Math.round(basePrice * (1 + adjustment.amount / 100) * 100) / 100,
        );
      } else {
        // El amount ES el precio final (no un ajuste incremento)
        return Math.max(0, adjustment.amount);
      }
    }

    // Sin ajuste, usar precio base del producto
    return product.price ?? 0;
  }

  /**
   * Obtiene la prioridad de un ajuste (mayor = más específico)
   */
  private getAdjustmentPriority(adjustment: PriceAdjustment): number {
    let priority = 0;

    // productId es lo más específico
    if (adjustment.productId) priority += 100;

    // subcategoryId es más específico que solo categoría
    if (adjustment.subcategoryId) priority += 20;

    // categoryId es el más general
    if (adjustment.categoryId) priority += 10;

    // productSizeId agrega especificidad
    if (adjustment.productSizeId) priority += 5;

    return priority;
  }

  /**
   * Valida si la selección cumple con los requisitos del grupo
   */
  validateSelection(
    group: ProductBundleGroup,
    selectedCount: number,
  ): { valid: boolean; message?: string } {
    const min = group.minSelections ?? 0;
    const max = group.maxSelections ?? Infinity;

    if (selectedCount < min) {
      return {
        valid: false,
        message: `Debes seleccionar al menos ${min} ${min === 1 ? 'item' : 'items'}`,
      };
    }

    if (selectedCount > max) {
      return {
        valid: false,
        message: `No puedes seleccionar más de ${max} ${max === 1 ? 'item' : 'items'}`,
      };
    }

    return { valid: true };
  }
}
