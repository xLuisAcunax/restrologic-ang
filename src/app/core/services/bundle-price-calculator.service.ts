import { Injectable, inject } from '@angular/core';
import {
  ProductBundleGroup,
  ProductBundlePriceMode,
} from './product-bundle.service';

/**
 * Item seleccionado por el usuario en un grupo de modificadores
 */
export interface SelectedBundleItem {
  /** ID del producto seleccionado */
  productId: string;
  /** ID del tamaño del producto (opcional) */
  productSizeId?: string | null;
  /** Precio del producto (obtenido del ajuste de precios) */
  price: number;
  /** Cantidad seleccionada */
  quantity: number;
  /** Precio override (si está definido en el item del grupo) */
  priceOverride?: number | null;
}

/**
 * Resultado del cálculo de precio de un grupo
 */
export interface GroupPriceResult {
  /** ID del grupo */
  groupId?: string;
  /** Nombre del grupo */
  groupName: string;
  /** Precio calculado para este grupo */
  calculatedPrice: number;
  /** Modo de precio usado */
  priceMode: ProductBundlePriceMode;
  /** Items que se usaron para el cálculo */
  items: SelectedBundleItem[];
  /** Detalle del cálculo (para debugging/UI) */
  calculationDetail: string;
}

/**
 * Resultado del cálculo total del bundle
 */
export interface BundlePriceResult {
  /** Precio base del producto principal */
  baseProductPrice: number;
  /** Resultados por grupo */
  groupResults: GroupPriceResult[];
  /** Precio total calculado (base + suma de grupos) */
  totalPrice: number;
}

@Injectable({ providedIn: 'root' })
export class BundlePriceCalculatorService {
  /**
   * Calcula el precio de un grupo de modificadores basado en los items seleccionados
   * @param group Configuración del grupo
   * @param selectedItems Items seleccionados por el usuario con sus precios
   * @param basePrice Precio base del producto principal (para BaseProductPrice mode)
   */
  calculateGroupPrice(
    group: ProductBundleGroup,
    selectedItems: SelectedBundleItem[],
    basePrice: number = 0,
  ): GroupPriceResult {
    const priceMode = this.normalizePriceMode(group.priceMode);

    // Obtener los precios efectivos (considerar priceOverride si existe)
    const effectivePrices = selectedItems.map((item) => {
      const price =
        item.priceOverride !== null && item.priceOverride !== undefined
          ? item.priceOverride
          : item.price;
      return price * item.quantity;
    });

    let calculatedPrice = 0;
    let calculationDetail = '';

    switch (priceMode) {
      case ProductBundlePriceMode.SumAllPrices:
        calculatedPrice = this.sumAll(effectivePrices);
        calculationDetail = `Suma: ${effectivePrices.join(' + ')} = ${calculatedPrice}`;
        break;

      case ProductBundlePriceMode.HighestPrice:
        calculatedPrice = this.highest(effectivePrices);
        calculationDetail = `Más alto de [${effectivePrices.join(', ')}] = ${calculatedPrice}`;
        break;

      case ProductBundlePriceMode.LowestPrice:
        calculatedPrice = this.lowest(effectivePrices);
        calculationDetail = `Más bajo de [${effectivePrices.join(', ')}] = ${calculatedPrice}`;
        break;

      case ProductBundlePriceMode.AveragePrice:
        const maxSelections = group.maxSelections ?? selectedItems.length;
        calculatedPrice = this.average(effectivePrices, maxSelections);
        calculationDetail = `Promedio: (${effectivePrices.join(' + ')}) / ${maxSelections} = ${calculatedPrice}`;
        break;

      case ProductBundlePriceMode.FirstItemPrice:
        calculatedPrice = effectivePrices[0] ?? 0;
        calculationDetail = `Primer item: ${calculatedPrice}`;
        break;

      case ProductBundlePriceMode.LastItemPrice:
        calculatedPrice = effectivePrices[effectivePrices.length - 1] ?? 0;
        calculationDetail = `Último item: ${calculatedPrice}`;
        break;

      case ProductBundlePriceMode.BaseProductPrice:
        calculatedPrice = basePrice;
        calculationDetail = `Precio base: ${basePrice}`;
        break;

      default:
        calculatedPrice = this.sumAll(effectivePrices);
        calculationDetail = `Default (Suma): ${calculatedPrice}`;
    }

    // Aplicar priceOverride del grupo si existe
    if (
      group.priceOverride !== null &&
      group.priceOverride !== undefined &&
      group.priceOverride > 0
    ) {
      calculationDetail += ` → Override grupo: ${group.priceOverride}`;
      calculatedPrice = group.priceOverride;
    }

    return {
      groupId: group.id,
      groupName: group.name,
      calculatedPrice: Math.round(calculatedPrice * 100) / 100,
      priceMode,
      items: selectedItems,
      calculationDetail,
    };
  }

  /**
   * Calcula el precio total del bundle considerando todos los grupos
   * @param baseProductPrice Precio base del producto principal
   * @param groups Grupos del bundle con sus configuraciones
   * @param selectedItemsByGroup Map de groupId -> items seleccionados
   */
  calculateBundlePrice(
    baseProductPrice: number,
    groups: ProductBundleGroup[],
    selectedItemsByGroup: Map<string, SelectedBundleItem[]>,
  ): BundlePriceResult {
    const groupResults: GroupPriceResult[] = [];

    for (const group of groups) {
      const groupId = group.id ?? group.name;
      const selectedItems = selectedItemsByGroup.get(groupId) ?? [];

      // Solo calcular si hay items seleccionados o si es BaseProductPrice
      if (
        selectedItems.length > 0 ||
        group.priceMode === ProductBundlePriceMode.BaseProductPrice
      ) {
        const result = this.calculateGroupPrice(
          group,
          selectedItems,
          baseProductPrice,
        );
        groupResults.push(result);
      }
    }

    // Calcular precio total: base + suma de todos los grupos
    const groupsTotal = groupResults.reduce(
      (sum, r) => sum + r.calculatedPrice,
      0,
    );

    // Si algún grupo usa BaseProductPrice, no sumar el base de nuevo
    const hasBaseMode = groupResults.some(
      (r) => r.priceMode === ProductBundlePriceMode.BaseProductPrice,
    );

    const totalPrice = hasBaseMode
      ? groupsTotal
      : baseProductPrice + groupsTotal;

    return {
      baseProductPrice,
      groupResults,
      totalPrice: Math.round(totalPrice * 100) / 100,
    };
  }

  /**
   * Obtiene el nombre legible del modo de precio
   */
  getPriceModeName(mode: ProductBundlePriceMode | string | undefined): string {
    const normalizedMode = this.normalizePriceMode(mode);
    const names: Record<ProductBundlePriceMode, string> = {
      [ProductBundlePriceMode.SumAllPrices]: 'Suma de precios',
      [ProductBundlePriceMode.HighestPrice]: 'Precio más alto',
      [ProductBundlePriceMode.LowestPrice]: 'Precio más bajo',
      [ProductBundlePriceMode.AveragePrice]: 'Precio promedio',
      [ProductBundlePriceMode.FirstItemPrice]: 'Precio del primer item',
      [ProductBundlePriceMode.LastItemPrice]: 'Precio del último item',
      [ProductBundlePriceMode.BaseProductPrice]: 'Precio base del producto',
    };
    return names[normalizedMode] ?? 'Desconocido';
  }

  // ─── Helpers privados ─────────────────────────────────────────────

  private normalizePriceMode(mode: ProductBundlePriceMode | string | undefined): ProductBundlePriceMode {
    if (mode === undefined || mode === null) {
      return ProductBundlePriceMode.SumAllPrices;
    }
    if (typeof mode === 'string') {
      const parsed = parseInt(mode, 10);
      if (!isNaN(parsed)) return parsed as ProductBundlePriceMode;
      // Tratar de mapear string name a enum (ej: "AveragePrice" -> 3)
      if (mode in ProductBundlePriceMode) {
        return ProductBundlePriceMode[mode as keyof typeof ProductBundlePriceMode];
      }
    }
    return mode as ProductBundlePriceMode;
  }

  private sumAll(prices: number[]): number {
    return prices.reduce((acc, p) => acc + p, 0);
  }

  private highest(prices: number[]): number {
    if (prices.length === 0) return 0;
    return Math.max(...prices);
  }

  private lowest(prices: number[]): number {
    if (prices.length === 0) return 0;
    return Math.min(...prices);
  }

  private average(prices: number[], maxSelections: number): number {
    if (prices.length === 0) return 0;
    const divisor = maxSelections > 0 ? maxSelections : prices.length;
    return this.sumAll(prices) / divisor;
  }
}
