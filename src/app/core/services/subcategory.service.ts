import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Category } from './category.service';

export type Subcategory = {
  id: string;
  name: string;
  isActive: boolean;
  categoryId: string;
  category?: Category;
  priceAdjustment?: number;
};

export type CreateSubcategoryDto = {
  name: string;
  categoryId: string;
  isActive: boolean;
  priceAdjustment?: number;
  createdBy?: string;
};

export type UpdateSubcategoryDto = {
  name?: string;
  categoryId?: string;
  priceAdjustment?: number;
  isActive?: boolean;
};

@Injectable({ providedIn: 'root' })
export class SubcategoryService {
  private readonly base = environment.apiBaseUrl;

  private _subcategories = signal<Subcategory[]>([]);
  private _isLoading = signal<boolean>(false);

  public readonly subcategories = this._subcategories.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();

  http = inject(HttpClient);

  getSubcategories() {
    return this.http.get<Subcategory[]>(`${this.base}/subcategories`);
  }

  createSubcategory(dto: CreateSubcategoryDto) {
    console.log('Creating subcategory with DTO:', dto);
    return this.http.post<Subcategory>(`${this.base}/subcategories`, dto);
  }

  updateSubcategory(dto: UpdateSubcategoryDto, subcategoryId: string) {
    return this.http.patch<Subcategory>(
      `${this.base}/subcategories/${subcategoryId}`,
      dto,
    );
  }

  deleteSubcategory(subcategoryId: string) {
    return this.http.delete<void>(`${this.base}/subcategory/${subcategoryId}`);
  }

  public loadCategories(): void {
    if (this._subcategories().length > 0) this.forceRefresh();
  }

  public forceRefresh(): void {
    this._isLoading.set(true);

    this.getSubcategories().subscribe({
      next: (subcategories) => {
        this._subcategories.set(subcategories);
        console.log('Subcategories loaded:', subcategories);
        this._isLoading.set(false);
      },
      error: () => {
        this._isLoading.set(false);
      },
    });
  }
}
