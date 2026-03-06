import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

export type Category = {
  id: string;
  name: string;
  isActive: boolean;
};

export type CreateCategoryDto = {
  name: string;
  createdBy: string;
  isActive: boolean;
};

export type UpdateCategoryDto = {
  name?: string;
  isActive?: boolean;
  createdBy?: string;
};

export type CategoryResponse = {
  items: Category[];
  total: number;
};

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly base = environment.apiBaseUrl;
  private _categories = signal<Category[]>([]);
  private _isLoading = signal<boolean>(false);

  public readonly categories = this._categories.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();

  http = inject(HttpClient);

  getCategories() {
    return this.http.get<Category[]>(`${this.base}/categories`);
  }

  getActiveCategories() {
    return this.http.get<Category[]>(`${this.base}/categories?onlyActive=true`);
  }

  getCategoriesByType(typeId: string) {
    return this.http.get<Category[]>(
      `${this.base}/product-types/${typeId}/categories`,
    );
  }

  createCategory(dto: CreateCategoryDto) {
    return this.http.post<Category>(`${this.base}/categories`, dto);
  }

  updateCategory(dto: UpdateCategoryDto, categoryId: string) {
    return this.http.put<Category>(
      `${this.base}/categories/${categoryId}`,
      dto,
    );
  }

  deleteCategory(categoryId: string) {
    return this.http.delete<void>(`${this.base}/categories/${categoryId}`);
  }

  public loadCategoriesIfNeeded(): void {
    if (this._categories().length > 0) return; // Ya tenemos datos, no hacer nada.

    this.forceRefresh();
  }

  public forceRefresh(): void {
    this._isLoading.set(true);

    this.getCategories().subscribe({
      next: (categories) => {
        this._categories.set(categories);
        console.log('Categories loaded:', categories);
        this._isLoading.set(false);
      },
      error: () => {
        this._isLoading.set(false);
      },
    });
  }
}
