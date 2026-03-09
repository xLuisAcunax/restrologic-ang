import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Router } from '@angular/router';
import { catchError, map, Observable, of, switchMap, tap } from 'rxjs';
import { ModuleService } from './module.service';
import { DataCacheService } from './data-cache.service';
import { LoggedUser } from '../models/user.model';

interface Tenant {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private moduleService = inject(ModuleService);
  private dataCacheService = inject(DataCacheService);
  private readonly base = environment.apiBaseUrl;

  // ---------- STATE (Signals) ----------
  private _me = signal<LoggedUser | null>(null);
  me = computed(() => this._me());

  // ---------- TOKEN ----------
  get token(): string | null {
    return localStorage.getItem('token');
  }

  private setToken(token: string | null) {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }

  // ---------- AUTH FLOW ----------
  login(email: string, password: string) {
    return this.http
      .post<{ token: string; user: any }>(`${this.base}/Auth/login`, {
        email,
        password,
      })
      .pipe(
        tap((res) => {
          this.setToken(res.token);
        }),
        switchMap(() => this.loadMe()),
        switchMap((me) => {
          const normalizedRoles = (me.roles || []).map((role) =>
            this.normalizeRole(role)
          );
          const isSuper = me.isSuper || normalizedRoles.includes('Super');

          if (isSuper) {
            return of(me);
          }

          return this.http.get<Tenant[]>(`${this.base}/Tenants`).pipe(
            switchMap((tenants) => {
              if (!tenants || tenants.length === 0) {
                throw new Error('No tenants available for this user');
              }

              const selectedTenant = tenants[0];

              return this.http
                .post<{ token: string }>(`${this.base}/Auth/switch-tenant`, {
                  tenantId: selectedTenant.id,
                })
                .pipe(
                  tap((switchRes) => {
                    this.setToken(switchRes.token);
                  }),
                  switchMap(() => this.loadMe())
                );
            })
          );
        })
      );
  }

  register(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) {
    return this.http
      .post<{ token: string; user: any }>(`${this.base}/Auth/register`, data)
      .pipe(tap((res) => this.setToken(res.token)));
  }

  logout() {
    this.setToken(null);
    this._me.set(null);
    this.moduleService.clearEffectiveModules();
    this.dataCacheService.clearCache();
    this.router.navigate(['/signin']);
  }

  loadMe(res?: LoggedUser | null): Observable<LoggedUser> {
    if (res) {
      this._me.set(res);
      this.primeBranchCache(res);
      return this.primeModules(res);
    }

    return this.http.get<LoggedUser>(`${this.base}/Auth/me`).pipe(
      switchMap((me) => {
        this._me.set(me);
        this.primeBranchCache(me);
        return this.primeModules(me);
      })
    );
  }

  clearMe() {
    this._me.set(null);
  }

  getTenants(): Observable<Tenant[]> {
    return this.http.get<Tenant[]>(`${this.base}/Tenants`);
  }

  switchTenant(tenantId: string): Observable<{ token: string }> {
    return this.http
      .post<{ token: string }>(`${this.base}/Auth/switch-tenant`, {
        tenantId,
      })
      .pipe(
        tap((res) => {
          this.setToken(res.token);
        }),
        switchMap(() => this.loadMe().pipe(map(() => ({ token: this.token! }))))
      );
  }

  private primeModules(me: LoggedUser): Observable<LoggedUser> {
    if (!me.tenantId) {
      this.moduleService.clearEffectiveModules();
      return of(me);
    }

    return this.moduleService
      .loadEffectiveModules(me.tenantId, me.branchId ?? null)
      .pipe(map(() => me));
  }

  private primeBranchCache(me: LoggedUser): void {
    if (!me.tenantId || !me.branchId) {
      return;
    }

    this.dataCacheService
      .loadDataForBranch(me.tenantId, me.branchId)
      .catch((err) => console.error('Error pre-loading data cache:', err));
  }

  private normalizeRole(role: string): string {
    const normalized = String(role || '').trim().toUpperCase();

    switch (normalized) {
      case 'CASHIER':
      case 'CAJERO':
        return 'Cajero';
      case 'WAITER':
      case 'MESERO':
      case 'MESERA':
        return 'Mesero';
      case 'KITCHEN':
      case 'COCINA':
      case 'COCINERO':
      case 'COCINERA':
        return 'Cocina';
      case 'DELIVERY':
      case 'REPARTIDOR':
      case 'DOMICILIARIO':
        return 'Repartidor';
      case 'ADMIN':
        return 'Admin';
      case 'SUPER':
        return 'Super';
      default:
        return role;
    }
  }

  getRole(): string[] | undefined {
    const roles = this._me()?.roles;
    return roles?.map((role) => this.normalizeRole(role));
  }

  ensureLoadMe(): Observable<boolean> {
    if (this._me()) return of(true);
    return this.loadMe().pipe(
      map(() => true),
      catchError(() => {
        this.setToken(null);
        this._me.set(null);
        return of(false);
      })
    );
  }

  updateUser(userId: string, dto: any): Observable<any> {
    return this.http.put(`${this.base}/Auth/${userId}`, dto);
  }

  resetPassword(userId: string, password: string): Observable<any> {
    return this.http.post(`${this.base}/Auth/${userId}/reset-password`, {
      newPassword: password,
    });
  }
}
