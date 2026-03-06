import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ErrorLogItem {
  id: string;
  errorId: string;
  status: number;
  component?: string; // NUEVO
  name?: string | null;
  message: string;
  stack?: string | null;
  path: string;
  method: string;
  query?: string | null;
  body?: string | null;
  headers?: string | null;
  details?: string | null;
  tenantId?: string | null;
  branchId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userRoles?: string[] | null;
  requestId?: string | null;
  ip?: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ErrorLogService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  list(params?: { limit?: number; since?: string; component?: string }) {
    let httpParams = new HttpParams();
    if (params?.limit) {
      httpParams = httpParams.set('limit', String(params.limit));
    }
    if (params?.since) {
      httpParams = httpParams.set('since', params.since);
    }
    if (params?.component) {
      httpParams = httpParams.set('component', params.component);
    }
    return this.http
      .get<{ ok: boolean; data: ErrorLogItem[] }>(`${this.baseUrl}/errors`, {
        params: httpParams,
      })
      .pipe(map((res) => res.data ?? []));
  }

  get(errorId: string) {
    return this.http
      .get<{ ok: boolean; data: ErrorLogItem }>(
        `${this.baseUrl}/errors/${errorId}`
      )
      .pipe(map((res) => res.data));
  }
}
