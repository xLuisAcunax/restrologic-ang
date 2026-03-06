import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Category } from './category.service';

export type ProductSize = {
  id: string;
  name: string;
  isActive: boolean;
  categoryId: string;
  category?: Category;
  priceAdjustment?: number;
};

export type CreateProductSizeDto = {
  name: string;
  categoryId: string;
  isActive: boolean;
  priceAdjustment?: number;
  createdBy?: string;
};

export type UpdateProductSizeDto = {
  name?: string;
  categoryId?: string;
  priceAdjustment?: number;
  isActive?: boolean;
};

@Injectable({ providedIn: 'root' })
export class ProductSizeService {
  private readonly base = environment.apiBaseUrl;

  private _productSizes = signal<ProductSize[]>([]);
  private _isLoading = signal<boolean>(false);

  public readonly productSizes = this._productSizes.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();

  http = inject(HttpClient);

  getProductSizes() {
    return this.http.get<ProductSize[]>(`${this.base}/product-sizes`);
  }

  createProductSize(dto: CreateProductSizeDto) {
    console.log('Creating subcategory with DTO:', dto);
    return this.http.post<ProductSize>(`${this.base}/product-sizes`, dto);
  }

  updateProductSize(dto: UpdateProductSizeDto, productSizeId: string) {
    return this.http.patch<ProductSize>(
      `${this.base}/product-sizes/${productSizeId}`,
      dto,
    );
  }

  deleteProductSize(tenantId: string, branchId: string, productSizeId: string) {
    return this.http.delete<void>(
      `${this.base}/product-sizes/${productSizeId}`,
    );
  }

  public loadProductSizes(): void {
    if (this._productSizes().length > 0) this.forceRefresh();
  }

  public forceRefresh(): void {
    this._isLoading.set(true);

    this.getProductSizes().subscribe({
      next: (productSizes) => {
        this._productSizes.set(productSizes);
        console.log('Product Sizes loaded:', productSizes);
        this._isLoading.set(false);
      },
      error: () => {
        this._isLoading.set(false);
      },
    });
  }
}
