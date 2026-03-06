import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Router } from '@angular/router';
import { catchError, map, Observable, of, tap, switchMap } from 'rxjs';
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
  private _me = signal<LoggedUser | null>(null); // fuente de verdad global
  me = computed(() => this._me()); // lectura pública

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
          this.setToken(res.token); // Set initial token for API auth
        }),
        switchMap((loginRes) => {
          // Fetch available tenants for this user
          return this.http.get<Tenant[]>(`${this.base}/Tenants`).pipe(
            switchMap((tenants) => {
              if (!tenants || tenants.length === 0) {
                throw new Error('No tenants available for this user');
              }

              // Auto-select: if only one tenant, use it; otherwise use first one
              const selectedTenant = tenants[0];

              // Call switch-tenant to get the tenant-specific token
              return this.http
                .post<{ token: string }>(`${this.base}/Auth/switch-tenant`, {
                  tenantId: selectedTenant.id,
                })
                .pipe(
                  tap((switchRes) => {
                    // Update token with the tenant-specific one
                    this.setToken(switchRes.token);
                  })
                );
            })
          );
        }),
        switchMap(() => {
          // After successful login and tenant selection, load user profile
          return this.loadMe();
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
    this.moduleService.clearEffectiveModules(); // Clear modules on logout
    this.dataCacheService.clearCache(); // Clear data cache on logout
    this.router.navigate(['/signin']);
  }

  // Hidrata / actualiza el perfil
  loadMe(res?: LoggedUser | null): Observable<LoggedUser> {
    if (res) {
      this._me.set(res);
      // Load effective modules after setting user profile
      this.moduleService
        .loadEffectiveModules(res.tenantId, res.branchId)
        .subscribe();
      //Load data cache for this branch if both tenantId and branchId are present
      if (res.tenantId && res.branchId) {
        const tenantId = res.tenantId;
        const branchId = res.branchId;
        this.dataCacheService
          .loadDataForBranch(tenantId, branchId)
          .catch((err) => console.error('Error pre-loading data cache:', err));
      }
      return of(res);
    }
    // Fetch from API if no argument
    return this.http.get<LoggedUser>(`${this.base}/Auth/me`).pipe(
      tap((me) => {
        this._me.set(me);
        // Load effective modules after fetching user profile
        // this.moduleService
        //   .loadEffectiveModules(me.tenantId, me.branchId)
        //   .subscribe();
        // Load data cache for this branch if both tenantId and branchId are present
        if (me.tenantId && me.branchId) {
          const tenantId = me.tenantId;
          const branchId = me.branchId;
          this.dataCacheService
            .loadDataForBranch(tenantId, branchId)
            .catch((err) =>
              console.error('Error pre-loading data cache:', err)
            );
        }
      })
    );
  }

  clearMe() {
    this._me.set(null);
  }

  // Get available tenants for current user
  getTenants(): Observable<Tenant[]> {
    return this.http.get<Tenant[]>(`${this.base}/Tenants`);
  }

  // Switch to a different tenant
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

  getRole(): string[] | undefined {
    const role = this._me()?.roles;
    return role;
  }

  ensureLoadMe(): Observable<boolean> {
    if (this._me()) return of(true);
    return this.loadMe().pipe(
      map(() => true),
      catchError((err) => {
        // si falla (token inválido/expirado), limpia session y devuelve false
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
