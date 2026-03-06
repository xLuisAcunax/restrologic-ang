import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, tap, map } from 'rxjs/operators';
import { of, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProductTypeEnum } from '../enums/product-type.enum';
import { BranchSelectionService } from './branch-selection.service';

export type Product = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  imageUrl?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  productSizeId?: string | null;
  productTypeId?: string | null;
  branchId?: string | null;
  isActive: boolean;
  createdAt?: string;
  createdBy?: string;
  hasOptions?: boolean;
};

export type CreateProductDto = {
  name: string;
  description?: string | null;
  price: number;
  imageUrl?: string | null;
  type?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  productSizeId?: string | null;
  productTypeId?: string | null;
  branchId?: string | null;
  isActive: boolean;
  createdBy?: string;
};

export type UpdateProductDto = {
  name?: string;
  description?: string | null;
  price?: number;
  imageUrl?: string | null;
  type?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  productSizeId?: string | null;
  productTypeId?: string | null;
  branchId?: string | null;
  isActive?: boolean;
};

export type UpdateProduct = {
  productId: string;
  name: string;
  description?: string | null;
  price: number; // Base price before modifiers
  imageUrl?: string | null; // Product image URL
  type: ProductTypeEnum;
  categoryId?: string | null;
  branchId?: string | null;
  isActive: boolean;
};

export type ProductFilters = {
  branchId?: string;
  categoryId?: string | string[];
  subcategoryId?: string | string[];
  productSizeId?: string | string[];
  productTypeId?: string | string[];
  onlyActive?: boolean;
};

@Injectable({
  providedIn: 'root',
})
export class ProductService {
  private readonly base = environment.apiBaseUrl;

  private _products = signal<Product[]>([]);
  private _isLoading = signal<boolean>(false);
  branchId = signal<string>('');

  public readonly products = this._products.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();

  http = inject(HttpClient);
  branchService = inject(BranchSelectionService);

  // Event stream to notify all components when products change
  private productChanged = new Subject<{
    tenantId: string;
    branchId: string;
  }>();
  productChanged$ = this.productChanged.asObservable();

  getProducts(types?: string[] | null) {
    const url = `${this.base}/products/by-type?expand=groups`;
    const params: any = {
      branchId: this.branchService.selectedBranchId()!,
    };
    if (types && types.length > 0) {
      params.types = types;
    }
    return this.http.get<{ product: Product }[]>(url, { params }).pipe(
      map((items) => items.map((item) => item.product)),
      catchError((error) => {
        console.error('Error loading products:', error);
        return of([]);
      }),
    );
  }

  createProduct(dto: CreateProductDto) {
    return this.http.post<Product>(`${this.base}/products`, dto);
  }

  updateProduct(dto: UpdateProductDto, productId: string) {
    return this.http.patch<Product>(`${this.base}/products/${productId}`, dto);
  }

  deleteProduct(productId: string) {
    return this.http.delete<void>(`${this.base}/products/${productId}`);
  }

  getProductsWithFilters(filters: ProductFilters) {
    let params = new HttpParams();
    if (filters.branchId) params = params.set('branchId', filters.branchId);
    if (filters.onlyActive !== undefined)
      params = params.set('onlyActive', String(filters.onlyActive));

    const setParam = (key: string, value?: string | string[]) => {
      if (!value) return;
      if (Array.isArray(value)) {
        if (value.length === 0) return;
        params = params.set(key, value.join(','));
      } else {
        params = params.set(key, value);
      }
    };

    setParam('categoryId', filters.categoryId);
    setParam('subcategoryId', filters.subcategoryId);
    setParam('productSizeId', filters.productSizeId);
    setParam('productTypeId', filters.productTypeId);

    return this.http.get<Product[]>(`${this.base}/products`, { params }).pipe(
      catchError((error) => {
        console.error('Error loading filtered products:', error);
        return of([]);
      }),
    );
  }

  public loadProductsIfNeeded(): void {
    if (this._products().length > 0) return;
    this.forceRefresh();
  }

  public forceRefresh(): void {
    this._isLoading.set(true);

    this.getProducts().subscribe({
      next: (products) => {
        this._products.set(products);
        console.log('Products loaded:', products);
        this._isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading products:', error);
        this._isLoading.set(false);
      },
    });
  }
}
