import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export enum ProductBundlePriceMode {
  /** SUMA(precio) - Suma de todos los precios */
  SumAllPrices = 0,
  /** MAX(precio) - Precio más alto */
  HighestPrice = 1,
  /** MIN(precio) - Precio más bajo */
  LowestPrice = 2,
  /** PROMEDIO(precio) - Precio promedio */
  AveragePrice = 3,
  /** PRIMERO(precio) - Precio del primer item */
  FirstItemPrice = 4,
  /** ULTIMO(precio) - Precio del último item */
  LastItemPrice = 5,
  /** BASE - Precio base del producto */
  BaseProductPrice = 6,
}

export enum ProductBundleKind {
  /** Combo tradicional */
  Combo = 0,
  /** Por porciones (ej: pizza por mitades) */
  Portioned = 1,
  /** Elección entre opciones */
  Choice = 2,
}

export type ProductBundleItem = {
  id?: string;
  productId: string;
  productSizeId?: string | null;
  priceOverride?: number | null;
  quantity?: number;
  sortOrder?: number;
};

export type ProductBundleGroup = {
  id?: string;
  name: string;
  minSelections?: number;
  maxSelections?: number;
  sortOrder?: number;
  useDynamicProduct?: boolean;
  scopeCategoryIds?: string[];
  scopeSubcategoryIds?: string[];
  scopeProductTypeIds?: string[];
  scopeProductSizeIds?: string[];
  priceMode?: ProductBundlePriceMode;
  priceOverride?: number | null;
  items?: ProductBundleItem[];
};

export type ProductBundle = {
  id: string;
  productId: string;
  name: string;
  description?: string | null;
  kind?: ProductBundleKind | string;
  isActive: boolean;
  groups?: ProductBundleGroup[];
  createdAt?: string;
  updatedAt?: string;
};

export type CreateProductBundleDto = {
  productId: string;
  name: string;
  description?: string | null;
  kind?: ProductBundleKind | string;
  isActive: boolean;
  groups: ProductBundleGroup[];
};

export type UpdateProductBundleDto = CreateProductBundleDto;

@Injectable({ providedIn: 'root' })
export class ProductBundleService {
  private readonly base = environment.apiBaseUrl;
  private http = inject(HttpClient);

  getBundles(filters?: { productId?: string }) {
    let params = new HttpParams();
    if (filters?.productId) {
      params = params.set('productId', filters.productId);
    }
    return this.http.get<ProductBundle[]>(`${this.base}/product-bundles`, {
      params,
    });
  }

  getBundle(id: string) {
    return this.http.get<ProductBundle>(`${this.base}/product-bundles/${id}`);
  }

  createBundle(dto: CreateProductBundleDto) {
    return this.http.post<ProductBundle>(`${this.base}/product-bundles`, dto);
  }

  updateBundle(id: string, dto: UpdateProductBundleDto) {
    return this.http.put<ProductBundle>(
      `${this.base}/product-bundles/${id}`,
      dto,
    );
  }

  deleteBundle(id: string) {
    return this.http.delete<void>(`${this.base}/product-bundles/${id}`);
  }
}
