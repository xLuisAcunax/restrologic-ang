import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
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
  // Align with other services (OrderService) – base should be apiBaseUrl only
  private base = environment.apiBaseUrl;

  /**
   * Get available drivers for assignment
   */
  getAvailableDrivers(
    tenantId: string,
    branchId: string,
    includeAssigned = false
  ): Observable<Driver[]> {
    // Primary endpoint (Phase B backend spec)
    const url = `${this.base}/tenant/${tenantId}/branch/${branchId}/drivers/available`;
    const params: Record<string, string> = {};
    if (includeAssigned) params['includeAssigned'] = 'true';

    return this.http.get<ApiResponse<Driver[]>>(url, { params }).pipe(
      switchMap((res) => {
        const list = res?.data || [];
        if (list.length > 0) return of(list);
        // Fallback: derive drivers from branch users with Repartidor role
        return this.http
          .get<{ ok: boolean; data: any[] }>(
            `${this.base}/users/branch/${branchId}`
          )
          .pipe(
            map((resp) => {
              const users = resp.data || [];
              return users
                .filter(
                  (u: any) =>
                    Array.isArray(u.roles) && u.roles.includes('Repartidor')
                )
                .map(
                  (u: any): Driver => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    activeDeliveries: 0,
                    lastDeliveryCompletedAt: null,
                    isAvailable: true,
                  })
                );
            })
          );
      }),
      catchError((err) => {
        console.warn(
          '[DriverService] Primary endpoint failed, attempting user fallback',
          err
        );
        return this.http
          .get<{ ok: boolean; data: any[] }>(
            `${this.base}/users/branch/${branchId}`
          )
          .pipe(
            map((resp) => {
              const users = resp.data || [];
              return users
                .filter(
                  (u: any) =>
                    Array.isArray(u.roles) && u.roles.includes('Repartidor')
                )
                .map(
                  (u: any): Driver => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    activeDeliveries: 0,
                    lastDeliveryCompletedAt: null,
                    isAvailable: true,
                  })
                );
            }),
            catchError(() => of([]))
          );
      })
    );
  }

  /**
   * Get driver details
   */
  getDriver(tenantId: string, driverId: string): Observable<Driver> {
    const url = `${this.base}/tenant/${tenantId}/drivers/${driverId}`;
    return this.http.get<ApiResponse<Driver>>(url).pipe(map((res) => res.data));
  }
}

