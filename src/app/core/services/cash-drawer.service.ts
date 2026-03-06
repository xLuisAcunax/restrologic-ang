import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

// ---------- Movement types ----------
export type CashMovementType = 'Income' | 'Outcome';

export type CashMovementDto = {
  id: string;
  sessionId?: string;
  type: CashMovementType | string;
  amount: number;
  reason?: string;
  reference?: string | null;
  createdAt: string;
  createdBy?: string;
  // Legacy fields for component compatibility
  concept?: string;
  source?: string;
  orderId?: string | null;
  notes?: string | null;
};

// ---------- Session types ----------
export type CashSessionStatus = 'Open' | 'Closed';
export type CashDrawerStatus = 'open' | 'closed';

export type CashSessionDto = {
  id: string;
  tenantId: string;
  branchId: string;
  status: CashSessionStatus;
  openingAmount: number;
  closingAmount?: number | null;
  expectedAmount?: number | null;
  difference?: number | null;
  openedAt: string;
  openedBy?: string;
  closedAt?: string | null;
  closedBy?: string | null;
  // Summary fields (returned by GET /api/cash-sessions/{id})
  totalIncome?: number;
  totalOutcome?: number;
  cashPaymentsTotal?: number;
  movements?: CashMovementDto[];
};

export type CashDrawerDto = {
  id: string;
  tenantId: string;
  branchId: string;
  status: CashDrawerStatus;
  openingFloat: number;
  totalIncome: number;
  totalOutcome: number;
  cashPaymentsTotal: number; // Pagos en efectivo de órdenes (auto-vinculados)
  openedAt: string;
  openedBy: string;
  notes: string | null;
  closingFloat: number | null;
  closedAt: string | null;
  closedBy: string | null;
  closingNotes: string | null;
  expectedClosing: number | null;
  variance: number | null;
  movements: CashMovementDto[];
  createdAt: string;
  updatedAt: string;
};

// ---------- Request DTOs ----------
export type OpenCashSessionRequest = {
  branchId: string;
  openingAmount: number;
};

export type CloseCashSessionRequest = {
  closingAmount: number;
};

export type RegisterCashMovementRequest = {
  type: CashMovementType; // 'Income' | 'Outcome'
  amount: number;
  reason: string;
  reference?: string;
};

// Legacy DTOs for component compatibility
export type OpenCashDrawerDto = {
  openingFloat: number;
  notes?: string | null;
};

export type CashDrawerMovementPayload = {
  type: 'income' | 'outcome';
  amount: number;
  concept: string;
  source: string;
  orderId?: string | null;
  notes?: string | null;
};

export type CloseCashDrawerDto = {
  closingFloat: number;
  expectedClosing: number;
  variance: number;
  closingNotes?: string | null;
};

// ---------- Response wrappers ----------
export type CashDrawerResponse = {
  ok: boolean;
  data: CashDrawerDto;
};

export type CashDrawerListResponse = {
  ok: boolean;
  data: CashDrawerDto[];
};

@Injectable({ providedIn: 'root' })
export class CashDrawerService {
  private readonly base = environment.apiBaseUrl;
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private withTenant() {
    const tenantId = this.auth.me()?.tenantId;
    return tenantId
      ? { headers: new HttpHeaders({ 'X-Tenant-ID': tenantId }) }
      : {};
  }

  private withTenantAndParams(params: HttpParams) {
    return { params, ...this.withTenant() };
  }

  /**
   * Map API CashSessionDto to legacy CashDrawerDto for component compatibility
   */
  private mapSessionToDrawer(session: CashSessionDto): CashDrawerDto {
    const mappedMovements: CashMovementDto[] = (session.movements || []).map(
      (m) => ({
        ...m,
        concept: m.reason || '',
        source: 'other',
        orderId: m.reference || null,
        notes: null,
      }),
    );

    return {
      id: session.id,
      tenantId: session.tenantId,
      branchId: session.branchId,
      status: session.status === 'Open' ? 'open' : 'closed',
      openingFloat: session.openingAmount,
      totalIncome: session.totalIncome ?? 0,
      totalOutcome: session.totalOutcome ?? 0,
      cashPaymentsTotal: session.cashPaymentsTotal ?? 0,
      openedAt: session.openedAt,
      openedBy: session.openedBy || '',
      notes: null,
      closingFloat: session.closingAmount ?? null,
      closedAt: session.closedAt ?? null,
      closedBy: session.closedBy ?? null,
      closingNotes: null,
      expectedClosing: session.expectedAmount ?? null,
      variance: session.difference ?? null,
      movements: mappedMovements,
      createdAt: session.openedAt,
      updatedAt: session.closedAt ?? session.openedAt,
    };
  }

  /**
   * GET /api/cash-sessions/open?branchId={branchId}
   * Get the currently open cash session for a branch
   */
  getCurrentDrawer(
    _tenantId: string,
    branchId: string,
  ): Observable<CashDrawerResponse> {
    const params = new HttpParams().set('branchId', branchId);
    return this.http
      .get<CashSessionDto>(
        `${this.base}/cash-sessions/open`,
        this.withTenantAndParams(params),
      )
      .pipe(
        // Fetch full session details with movements
        switchMap((session) =>
          this.http
            .get<CashSessionDto>(
              `${this.base}/cash-sessions/${session.id}`,
              this.withTenant(),
            )
            .pipe(catchError(() => of(session))),
        ),
        map((session) => ({
          ok: true,
          data: this.mapSessionToDrawer(session),
        })),
      );
  }

  /**
   * Nullable variant: returns the current drawer or null.
   * Interprets HTTP 404 as "no open session" without treating it like an error.
   */
  getCurrentDrawerNullable(
    tenantId: string,
    branchId: string,
  ): Observable<CashDrawerDto | null> {
    return this.getCurrentDrawer(tenantId, branchId).pipe(
      map((res) => res.data),
      catchError((err) => {
        if (err?.status === 404) {
          return of(null);
        }
        throw err;
      }),
    );
  }

  /**
   * GET /api/cash-sessions?branchId={branchId}
   * List cash session history for a branch
   */
  listDrawerHistory(
    _tenantId: string,
    branchId: string,
    options?: {
      status?: CashDrawerStatus | 'all';
      startDate?: string;
      endDate?: string;
      start?: string;
      end?: string;
    },
  ): Observable<CashDrawerListResponse> {
    let params = new HttpParams().set('branchId', branchId);

    if (options?.status && options.status !== 'all') {
      // Map legacy status to new API format
      const mappedStatus = options.status === 'open' ? 'Open' : 'Closed';
      params = params.set('status', mappedStatus);
    }
    if (options?.startDate) {
      params = params.set('startDate', options.startDate);
    }
    if (options?.endDate) {
      params = params.set('endDate', options.endDate);
    }
    if (options?.start) {
      params = params.set('start', options.start);
    }
    if (options?.end) {
      params = params.set('end', options.end);
    }

    return this.http
      .get<
        CashSessionDto[]
      >(`${this.base}/cash-sessions`, this.withTenantAndParams(params))
      .pipe(
        map((sessions) => ({
          ok: true,
          data: (sessions || []).map((s) => this.mapSessionToDrawer(s)),
        })),
      );
  }

  /**
   * POST /api/cash-sessions
   * Open a new cash session for a branch
   */
  openDrawer(
    _tenantId: string,
    branchId: string,
    payload: OpenCashDrawerDto,
  ): Observable<CashDrawerResponse> {
    const request: OpenCashSessionRequest = {
      branchId,
      openingAmount: payload.openingFloat,
    };

    return this.http
      .post<CashSessionDto>(
        `${this.base}/cash-sessions`,
        request,
        this.withTenant(),
      )
      .pipe(
        map((session) => ({
          ok: true,
          data: this.mapSessionToDrawer(session),
        })),
      );
  }

  /**
   * POST /api/cash-sessions/{id}/movements
   * Register a manual income/outcome movement
   */
  appendMovement(
    _tenantId: string,
    branchId: string,
    sessionId: string,
    payload: CashDrawerMovementPayload,
  ): Observable<CashDrawerResponse> {
    const request: RegisterCashMovementRequest = {
      type: payload.type === 'income' ? 'Income' : 'Outcome',
      amount: payload.amount,
      reason: payload.concept,
      reference: payload.orderId || payload.notes || undefined,
    };

    return this.http
      .post<CashMovementDto>(
        `${this.base}/cash-sessions/${sessionId}/movements`,
        request,
        this.withTenant(),
      )
      .pipe(
        // After adding movement, fetch updated session to get new totals
        switchMap(() => this.getCurrentDrawer('', branchId)),
      );
  }

  /**
   * POST /api/cash-sessions/{id}/close
   * Close a cash session with the actual counted amount
   */
  closeDrawer(
    _tenantId: string,
    _branchId: string,
    sessionId: string,
    payload: CloseCashDrawerDto,
  ): Observable<CashDrawerResponse> {
    const request: CloseCashSessionRequest = {
      closingAmount: payload.closingFloat,
    };

    return this.http
      .post<CashSessionDto>(
        `${this.base}/cash-sessions/${sessionId}/close`,
        request,
        this.withTenant(),
      )
      .pipe(
        map((session) => ({
          ok: true,
          data: this.mapSessionToDrawer(session),
        })),
      );
  }

  /**
   * GET /api/cash-sessions/{id}
   * Get session detail with summary (incomes, outcomes, cash payments, expected amount)
   */
  getCashSession(sessionId: string): Observable<CashDrawerDto> {
    return this.http
      .get<CashSessionDto>(
        `${this.base}/cash-sessions/${sessionId}`,
        this.withTenant(),
      )
      .pipe(map((session) => this.mapSessionToDrawer(session)));
  }

  /**
   * GET /api/cash-sessions/{id}/movements
   * List all movements for a session
   */
  getCashSessionMovements(sessionId: string): Observable<CashMovementDto[]> {
    return this.http.get<CashMovementDto[]>(
      `${this.base}/cash-sessions/${sessionId}/movements`,
      this.withTenant(),
    );
  }
}
