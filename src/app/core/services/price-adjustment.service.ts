import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { tap } from 'rxjs/operators';

export type PriceAdjustment = {
  id: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  productSizeId?: string | null;
  productId?: string | null;
  amount: number;
  isPercentage: boolean;
  isActive: boolean;
  createdAt?: string;
  createdBy?: string;
};

export type CreatePriceAdjustmentDto = {
  categoryId?: string | null;
  subcategoryId?: string | null;
  productSizeId?: string | null;
  productId?: string | null;
  amount: number;
  isPercentage: boolean;
  isActive: boolean;
};

export type UpdatePriceAdjustmentDto = {
  amount?: number;
  isPercentage?: boolean;
  isActive?: boolean;
};

export type PriceAdjustmentFilters = {
  categoryId?: string;
  subcategoryId?: string;
  productSizeId?: string;
  productId?: string;
  onlyActive?: boolean;
};

@Injectable({ providedIn: 'root' })
export class PriceAdjustmentService {
  private readonly base = environment.apiBaseUrl;

  private _priceAdjustments = signal<PriceAdjustment[]>([]);
  private _isLoading = signal<boolean>(false);

  public readonly priceAdjustments = this._priceAdjustments.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();

  private http = inject(HttpClient);

  /**
   * Obtener todos los price adjustments con filtros opcionales
   */
  getPriceAdjustments(filters?: PriceAdjustmentFilters) {
    let params = new HttpParams();

    if (filters) {
      if (filters.categoryId) {
        params = params.set('categoryId', filters.categoryId);
      }
      if (filters.subcategoryId) {
        params = params.set('subcategoryId', filters.subcategoryId);
      }
      if (filters.productSizeId) {
        params = params.set('productSizeId', filters.productSizeId);
      }
      if (filters.productId) {
        params = params.set('productId', filters.productId);
      }
      if (filters.onlyActive !== undefined) {
        params = params.set('onlyActive', filters.onlyActive.toString());
      }
    }

    return this.http.get<PriceAdjustment[]>(`${this.base}/price-adjustments`, {
      params,
    });
  }

  /**
   * Obtener un price adjustment por ID
   */
  getPriceAdjustmentById(id: string) {
    return this.http.get<PriceAdjustment>(
      `${this.base}/price-adjustments/${id}`,
    );
  }

  /**
   * Crear un nuevo price adjustment
   */
  createPriceAdjustment(dto: CreatePriceAdjustmentDto) {
    return this.http
      .post<PriceAdjustment>(`${this.base}/price-adjustments`, dto)
      .pipe(
        tap(() => {
          // Refrescar la lista después de crear
          this.forceRefresh();
        }),
      );
  }

  /**
   * Actualizar un price adjustment existente
   */
  updatePriceAdjustment(id: string, dto: UpdatePriceAdjustmentDto) {
    return this.http
      .patch<PriceAdjustment>(`${this.base}/price-adjustments/${id}`, dto)
      .pipe(
        tap(() => {
          // Refrescar la lista después de actualizar
          this.forceRefresh();
        }),
      );
  }

  /**
   * Eliminar un price adjustment
   */
  deletePriceAdjustment(id: string) {
    return this.http.delete<void>(`${this.base}/price-adjustments/${id}`).pipe(
      tap(() => {
        // Refrescar la lista después de eliminar
        this.forceRefresh();
      }),
    );
  }

  /**
   * Cargar price adjustments si aún no están cargados
   */
  public loadPriceAdjustmentsIfNeeded(): void {
    if (this._priceAdjustments().length > 0) return;
    this.forceRefresh();
  }

  /**
   * Forzar la recarga de price adjustments
   */
  public forceRefresh(filters?: PriceAdjustmentFilters): void {
    this._isLoading.set(true);

    this.getPriceAdjustments(filters).subscribe({
      next: (priceAdjustments) => {
        this._priceAdjustments.set(priceAdjustments);
        console.log('Price adjustments loaded:', priceAdjustments);
        this._isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading price adjustments:', error);
        this._isLoading.set(false);
      },
    });
  }
}
