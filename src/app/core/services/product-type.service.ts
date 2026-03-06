import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

export type ProductType = {
  id: string;
  name: string;
  isActive: boolean;
};

export type CreateProductTypeDto = {
  name: string;
  createdBy: string;
  isActive: boolean;
};

export type UpdateProductTypeDto = {
  name?: string;
  isActive?: boolean;
  createdBy?: string;
};

@Injectable({ providedIn: 'root' })
export class ProductTypeService {
  private readonly base = environment.apiBaseUrl;
  private _productTypes = signal<ProductType[]>([]);
  private _isLoading = signal<boolean>(false);

  public readonly productTypes = this._productTypes.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();

  http = inject(HttpClient);

  getProductTypes() {
    return this.http.get<ProductType[]>(`${this.base}/product-types`);
  }

  getActiveProductTypes() {
    return this.http.get<ProductType[]>(
      `${this.base}/product-types?onlyActive=true`,
    );
  }

  createProductType(dto: CreateProductTypeDto) {
    return this.http.post<ProductType>(`${this.base}/product-types`, dto);
  }

  updateProductType(dto: UpdateProductTypeDto, categoryId: string) {
    return this.http.put<ProductType>(
      `${this.base}/product-types/${categoryId}`,
      dto,
    );
  }

  deleteProductType(categoryId: string) {
    return this.http.delete<void>(`${this.base}/product-types/${categoryId}`);
  }

  public loadProductTypeIfNeeded(): void {
    if (this._productTypes().length > 0) return; // Ya tenemos datos, no hacer nada.

    this.forceRefresh();
  }

  public forceRefresh(): void {
    this._isLoading.set(true);

    this.getProductTypes().subscribe({
      next: (productType) => {
        this._productTypes.set(productType);
        console.log('Product Types loaded:', productType);
        this._isLoading.set(false);
      },
      error: () => {
        this._isLoading.set(false);
      },
    });
  }
}
