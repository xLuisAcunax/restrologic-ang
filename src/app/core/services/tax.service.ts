import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

type TaxApi = {
  id: string;
  name: string;
  isPercentage?: boolean;
  value?: number;
  percentage?: number; // legacy support
  isIncluded: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Tax = {
  id: string;
  name: string;
  isPercentage: boolean;
  value: number;
  percentage: number; // derived alias for existing UI/calculations
  isIncluded: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateTaxDto = {
  name: string;
  isPercentage: boolean;
  value: number;
  isIncluded: boolean;
  isActive: boolean;
};

export type UpdateTaxDto = Partial<CreateTaxDto>;

export type TaxResponse = {
  ok: boolean;
  data: Tax[];
};

@Injectable({ providedIn: 'root' })
export class TaxService {
  private readonly base = environment.apiBaseUrl;

  private _taxes = signal<Tax[]>([]);
  private _isLoading = signal<boolean>(false);

  public readonly taxes = this._taxes.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();

  http = inject(HttpClient);
  private auth = inject(AuthService);

  private normalizeTax = (input: TaxApi): Tax => {
    const fallbackValue =
      typeof input.value === 'number'
        ? input.value
        : typeof input.percentage === 'number'
          ? input.percentage
          : 0;
    const isPercentage =
      typeof input.isPercentage === 'boolean' ? input.isPercentage : true;
    const percentage = isPercentage ? fallbackValue : 0;

    return {
      ...input,
      isPercentage,
      value: fallbackValue,
      percentage,
    };
  };

  private withTenantHeader() {
    const tenantId = this.auth.me()?.tenantId;
    return tenantId
      ? { headers: new HttpHeaders({ 'X-Tenant-ID': tenantId }) }
      : {};
  }

  getTaxes() {
    return this.http
      .get<Tax[]>(`${this.base}/taxes`, this.withTenantHeader())
      .pipe(map((res) => (res || []).map((tax) => this.normalizeTax(tax))));
  }

  createTax(dto: CreateTaxDto) {
    return this.http
      .post<Tax>(`${this.base}/taxes`, dto, this.withTenantHeader())
      .pipe(map((res) => this.normalizeTax(res)));
  }

  updateTax(dto: UpdateTaxDto, taxId: string) {
    return this.http
      .patch<Tax>(`${this.base}/taxes/${taxId}`, dto, this.withTenantHeader())
      .pipe(map((res) => this.normalizeTax(res)));
  }

  deleteTax(taxId: string) {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/taxes/${taxId}`,
      this.withTenantHeader(),
    );
  }

  public loadTaxesIfNeeded(): void {
    if (this._taxes().length > 0) return; // Ya tenemos datos, no hacer nada.

    this.forceRefresh();
  }

  public forceRefresh(): void {
    this._isLoading.set(true);

    this.getTaxes().subscribe({
      next: (taxes) => {
        this._taxes.set(taxes);
        console.log('Taxes loaded:', taxes);
        this._isLoading.set(false);
      },
      error: () => {
        this._isLoading.set(false);
      },
    });
  }
}
