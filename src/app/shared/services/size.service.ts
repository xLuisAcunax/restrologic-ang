import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export type Size = {
  id: string;
  name: string;
  isActive: boolean;
};

@Injectable({ providedIn: 'root' })
export class SizeService {
  private http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  getSizes(tenantId: string, branchId: string): Observable<Size[]> {
    const url = `${this.base}/public/sizes?tenantId=${tenantId}&branchId=${branchId}`;
    return this.http
      .get<{ ok: boolean; data: Size[] }>(url)
      .pipe(map((r) => r.data ?? []));
  }
}
