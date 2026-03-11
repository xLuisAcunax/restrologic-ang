import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type BusinessItem = {
  id: string;
  nit: string | null;
  name: string;
  description?: string;
  isActive?: boolean;
  createdAt?: string;
  modules?: string[];
};

export type BranchSummary = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  modules?: string[];
  isActive?: boolean;
};

export type BusinessDetail = {
  id: string;
  name: string;
  description?: string;
  nit: string | null;
  isActive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  branches?: BranchSummary[];
};

export type UpdateBusinessDto = {
  nit?: string;
  name?: string;
  description?: string;
  isActive?: boolean;
  modules?: string[];
  createdBy?: string;
};

export type CreateTenantDto = {
  name: string;
  description?: string;
  schemaName: string;
  nit?: string;
  isActive?: boolean;
};

export type CreateBranchDto = {
  name: string;
  code?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  isActive?: boolean;
};

export type UpdateBranchDto = {
  name?: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  isActive?: boolean;
};

@Injectable({ providedIn: 'root' })
export class BusinessService {
  private readonly base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  private buildTenantHeaders(tenantId?: string): HttpHeaders | undefined {
    const normalizedTenantId = tenantId?.trim();
    if (!normalizedTenantId) {
      return undefined;
    }

    return new HttpHeaders({
      'X-Tenant-ID': normalizedTenantId,
    });
  }

  private normalizeBusiness<T extends Partial<BusinessDetail | BusinessItem>>(
    business: T
  ): T {
    return {
      ...business,
      nit: business.nit ?? null,
      isActive: business.isActive ?? true,
    } as T;
  }

  list(): Observable<{
    ok: boolean;
    data: BusinessItem[];
  }> {
    return this.http
      .get<BusinessItem[] | { ok: boolean; data: BusinessItem[] }>(
        `${this.base}/Tenants`
      )
      .pipe(
        map((response) => {
          if (Array.isArray(response)) {
            return {
              ok: true,
              data: response.map((item) => this.normalizeBusiness(item)),
            };
          }

          return {
            ok: response.ok ?? true,
            data: (response.data ?? []).map((item) =>
              this.normalizeBusiness(item)
            ),
          };
        })
      );
  }

  getBusiness(tenantId: string): Observable<{
    ok: boolean;
    data: BusinessDetail;
  }> {
    return this.http.get<BusinessDetail[]>(`${this.base}/Tenants`).pipe(
      map((tenants) => {
        const tenant = tenants.find((item) => item.id === tenantId);
        if (!tenant) {
          throw new Error('Tenant not found');
        }

        return { ok: true, data: this.normalizeBusiness(tenant) };
      })
    );
  }

  getBranches(tenantId?: string): Observable<BranchSummary[]> {
    const url = tenantId
      ? `${this.base}/Tenants/${tenantId}/branches`
      : `${this.base}/Branches`;

    return this.http.get<BranchSummary[]>(url);
  }

  getBranch(branchId: string, tenantId?: string): Observable<BranchSummary> {
    const headers = this.buildTenantHeaders(tenantId);
    return this.http.get<BranchSummary>(`${this.base}/Branches/${branchId}`, {
      headers,
    });
  }

  updateBusiness(
    id: string,
    dto: UpdateBusinessDto
  ): Observable<{ ok: boolean; data: BusinessDetail }> {
    return this.http
      .put<BusinessDetail>(`${this.base}/Tenants/${id}`, dto)
      .pipe(map((data) => ({ ok: true, data: this.normalizeBusiness(data) })));
  }

  updateBranch(branchId: string, dto: UpdateBranchDto, tenantId?: string) {
    const headers = this.buildTenantHeaders(tenantId);
    return this.http.put<{ ok: boolean; data: BranchSummary }>(
      `${this.base}/Branches/${branchId}`,
      dto,
      { headers }
    );
  }

  createBranch(
    tenantId: string,
    dto: CreateBranchDto
  ): Observable<{ ok: boolean; data: BranchSummary }> {
    const headers = this.buildTenantHeaders(tenantId);
    return this.http.post<{ ok: boolean; data: BranchSummary }>(
      `${this.base}/Branches`,
      dto,
      { headers }
    );
  }

  createTenant(
    dto: CreateTenantDto
  ): Observable<{ ok: boolean; data: BusinessDetail }> {
    return this.http
      .post<{
        message: string;
        tenant?: BusinessDetail;
        Tenant?: BusinessDetail;
        TenantId?: string;
      }>(`${this.base}/Tenants`, dto)
      .pipe(
        map((response) => ({
          ok: true,
          data: this.normalizeBusiness(
            (response.tenant ?? response.Tenant ?? {
              id: response.TenantId ?? '',
              name: dto.name,
              description: dto.description,
              nit: dto.nit ?? null,
              isActive: dto.isActive ?? true,
            }) as BusinessDetail
          ),
        }))
      );
  }
}
