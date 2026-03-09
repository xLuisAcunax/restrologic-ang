import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type BusinessItem = {
  id: string;
  nit: string;
  name: string;
  description?: string;
  isActive?: boolean;
  createdAt?: string;
  modules?: string[]; // e.g., ['SALES', 'INVENTORY']
};

export type BranchSummary = {
  id: string;
  name: string;
  address?: string | null;
  description?: string | null;
  modules?: string[]; // e.g., ['SALES', 'INVENTORY']
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
  modules?: string[]; // e.g., ['SALES', 'INVENTORY']
  createdBy?: string;
};

export type CreateTenantDto = {
  nit: string;
  name: string;
  description?: string;
  modules?: string[];
  createdBy: string;
  isActive?: boolean;
  createdAt?: string;
};

export type CreateBranchDto = {
  name: string;
  code?: string | null;
  address?: string | null;
};

export type UpdateBranchDto = {
  name?: string;
  address?: string | null;
  description?: string | null;
};

@Injectable({ providedIn: 'root' })
export class BusinessService {
  private readonly base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

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
            return { ok: true, data: response };
          }

          return {
            ok: response.ok ?? true,
            data: response.data ?? [],
          };
        })
      );
  }

  getBusiness(tenantId: string): Observable<{
    ok: boolean;
    data: BusinessDetail;
  }> {
    return this.http.get<{ ok: boolean; data: BusinessDetail }>(
      `${this.base}/tenant/${tenantId}`
    );
  }

  getBranches(tenantId?: string): Observable<BranchSummary[]> {
    const url = tenantId
      ? `${this.base}/Tenants/${tenantId}/branches`
      : `${this.base}/Branches`;

    return this.http.get<BranchSummary[]>(url);
  }

  getBranch(branchId: string): Observable<BranchSummary> {
    return this.http
      .get<BranchSummary[]>(`${this.base}/Branches`, {
        params: new HttpParams().set('branchId', branchId),
      })
      .pipe(
        map((branches) => {
          if (!branches || branches.length === 0) {
            throw new Error(`Branch with id ${branchId} not found`);
          }
          return branches[0]; // Return the first (and only) branch from the array
        })
      );
  }

  // Update business (PATCH). Server requires Authorization + SUPER|ADMIN role.
  updateBusiness(
    id: string,
    dto: UpdateBusinessDto
  ): Observable<{ ok: boolean; data: BusinessDetail }> {
    return this.http.put<{ ok: boolean; data: BusinessDetail }>(
      `${this.base}/tenant/${id}`,
      dto
    );
  }

  // Update branch (PATCH). Server requires Authorization + SUPER|ADMIN role.
  updateBranch(branchId: string, dto: UpdateBranchDto) {
    console.log('Updating branch with ID:', branchId, 'and DTO:', dto);
    return this.http.put<{ ok: boolean; data: BranchSummary }>(
      `${this.base}/Branches/${branchId}`,
      dto
    );
  }

  createBranch(
    tenantId: string,
    dto: UpdateBranchDto
  ): Observable<{ ok: boolean; data: BranchSummary }> {
    return this.http.post<{ ok: boolean; data: BranchSummary }>(
      `${this.base}/Branches`,
      dto
    );
  }

  createTenant(
    dto: CreateTenantDto
  ): Observable<{ ok: boolean; data: BusinessDetail }> {
    return this.http.post<{ ok: boolean; data: BusinessDetail }>(
      `${this.base}/tenant`,
      dto
    );
  }
}
