import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type Driver = {
  id: string;
  name: string;
  email: string;
  activeDeliveries: number;
  lastDeliveryCompletedAt: string | null;
  isAvailable: boolean;
};

export type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

@Injectable({ providedIn: 'root' })
export class DriverService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  getAvailableDrivers(
    tenantId: string,
    branchId: string,
    includeAssigned = false
  ): Observable<Driver[]> {
    const url = `${this.base}/tenant/${tenantId}/branch/${branchId}/drivers/available`;
    const params: Record<string, string> = {};
    if (includeAssigned) params['includeAssigned'] = 'true';

    return this.http.get<ApiResponse<Driver[]>>(url, { params }).pipe(
      switchMap((res) => {
        const list = res?.data || [];
        if (list.length > 0) return of(list);
        return this.getBranchDriversFallback(branchId);
      }),
      catchError(() => this.getBranchDriversFallback(branchId))
    );
  }

  getDriver(tenantId: string, driverId: string): Observable<Driver> {
    const url = `${this.base}/tenant/${tenantId}/drivers/${driverId}`;
    return this.http.get<ApiResponse<Driver>>(url).pipe(map((res) => res.data));
  }

  private getBranchDriversFallback(branchId: string): Observable<Driver[]> {
    return this.http
      .get<any[]>(`${this.base}/branches/${branchId}/users`)
      .pipe(
        map((users) =>
          (users || [])
            .filter(
              (u: any) =>
                String(u.role || '').trim().toLowerCase() === 'repartidor'
            )
            .map(
              (u: any): Driver => ({
                id: u.id,
                name:
                  [u.firstName, u.lastName].filter(Boolean).join(' ') ||
                  u.userName ||
                  u.email,
                email: u.email,
                activeDeliveries: 0,
                lastDeliveryCompletedAt: null,
                isAvailable: true,
              })
            )
        ),
        catchError(() => of([]))
      );
  }
}
