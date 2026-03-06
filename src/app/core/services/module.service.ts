import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  AssignModuleDto,
  CreateModuleDto,
  EffectiveModule,
  ModuleAssignment,
  ModuleManifest,
  UpdateModuleAssignmentDto,
  UpdateModuleDto,
} from '../models/module.model';

@Injectable({ providedIn: 'root' })
export class ModuleService {
  private readonly baseUrl = environment.apiBaseUrl;

  /**
   * BehaviorSubject to store effective modules for feature gating
   * Updated when loadEffectiveModules() is called
   */
  private effectiveModules$ = new BehaviorSubject<EffectiveModule[]>([]);

  constructor(private readonly http: HttpClient) {}

  listModules(params?: { status?: string }): Observable<ModuleManifest[]> {
    let httpParams = new HttpParams();
    if (params?.status) {
      httpParams = httpParams.set('status', params.status);
    }

    return this.http
      .get<{ ok: boolean; data: ModuleManifest[] }>(`${this.baseUrl}/modules`, {
        params: httpParams,
      })
      .pipe(map((response) => response.data ?? []));
  }

  getModule(key: string): Observable<ModuleManifest> {
    return this.http
      .get<{ ok: boolean; data: ModuleManifest }>(
        `${this.baseUrl}/modules/${key}`
      )
      .pipe(map((response) => response.data));
  }

  createModule(payload: CreateModuleDto): Observable<ModuleManifest> {
    return this.http
      .post<{ ok: boolean; data: ModuleManifest }>(
        `${this.baseUrl}/modules`,
        payload
      )
      .pipe(map((response) => response.data));
  }

  updateModule(
    key: string,
    payload: UpdateModuleDto
  ): Observable<ModuleManifest> {
    return this.http
      .patch<{ ok: boolean; data: ModuleManifest }>(
        `${this.baseUrl}/modules/${key}`,
        payload
      )
      .pipe(map((response) => response.data));
  }

  deleteModule(key: string): Observable<void> {
    return this.http
      .delete<{ ok: boolean }>(`${this.baseUrl}/modules/${key}`)
      .pipe(map(() => void 0));
  }

  listAssignments(params: {
    tenantId?: string;
    branchId?: string;
    moduleKey?: string;
  }): Observable<ModuleAssignment[]> {
    let httpParams = new HttpParams();
    if (params.tenantId) {
      httpParams = httpParams.set('tenantId', params.tenantId);
    }
    if (params.branchId) {
      httpParams = httpParams.set('branchId', params.branchId);
    }
    if (params.moduleKey) {
      httpParams = httpParams.set('moduleKey', params.moduleKey);
    }

    return this.http
      .get<{ ok: boolean; data: ModuleAssignment[] }>(
        `${this.baseUrl}/module-assignments`,
        { params: httpParams }
      )
      .pipe(map((response) => response.data ?? []));
  }

  assignModule(payload: AssignModuleDto): Observable<ModuleAssignment> {
    return this.http
      .post<{ ok: boolean; data: ModuleAssignment }>(
        `${this.baseUrl}/module-assignments`,
        payload
      )
      .pipe(map((response) => response.data));
  }

  updateAssignment(
    assignmentId: string,
    payload: UpdateModuleAssignmentDto
  ): Observable<ModuleAssignment> {
    return this.http
      .patch<{ ok: boolean; data: ModuleAssignment }>(
        `${this.baseUrl}/module-assignments/${assignmentId}`,
        payload
      )
      .pipe(map((response) => response.data));
  }

  removeAssignment(assignmentId: string): Observable<void> {
    return this.http
      .delete<{ ok: boolean }>(
        `${this.baseUrl}/module-assignments/${assignmentId}`
      )
      .pipe(map(() => void 0));
  }

  // ==================== FEATURE GATING METHODS ====================

  /**
   * Load effective modules for a tenant/branch combination
   * This should be called once during app initialization (after login)
   * @param tenantId - Tenant ID (optional, will use authenticated user's tenant if not provided)
   * @param branchId - Branch ID (optional, null for tenant-level)
   * @returns Observable of the API response
   */
  loadEffectiveModules(
    tenantId?: string,
    branchId?: string | null
  ): Observable<{ ok: boolean; data: EffectiveModule[] }> {
    let params = new HttpParams();
    if (tenantId) {
      params = params.set('tenantId', tenantId);
    }
    if (branchId) {
      params = params.set('branchId', branchId);
    }

    console.log('🔍 Loading effective modules for:', { tenantId, branchId });

    return this.http
      .get<{ ok: boolean; data: EffectiveModule[] }>(
        `${this.baseUrl}/modules/effective`,
        { params }
      )
      .pipe(
        tap((response) => {
          console.log('✅ Effective modules loaded:', response.data);
          this.effectiveModules$.next(response.data ?? []);
        }),
        catchError((error) => {
          // If no modules exist yet (404), initialize with empty array
          // This allows the app to work even without modules configured
          console.warn('⚠️ Error loading modules (using empty array):', {
            status: error.status,
            message: error.error?.message || error.message,
            tenantId,
            branchId,
            url: `${this.baseUrl}/modules/effective`,
          });
          this.effectiveModules$.next([]);
          // Return empty successful response to prevent app errors
          return of({ ok: true, data: [] });
        })
      );
  }

  /**
   * Get current effective modules as an Observable
   * Components can subscribe to this to react to module changes
   * @returns Observable of effective modules array
   */
  getEffectiveModules(): Observable<EffectiveModule[]> {
    return this.effectiveModules$.asObservable();
  }

  /**
   * Check if a specific module is enabled for the current user
   * This is a synchronous check using the cached modules
   * @param moduleKey - Module key to check (e.g., 'deliveries', 'inventory')
   * @returns true if module is enabled, false otherwise
   */
  isModuleEnabled(moduleKey: string): boolean {
    const modules = this.effectiveModules$.value;
    const module = modules.find((m) => m.moduleKey === moduleKey);
    return module?.enabled ?? false;
  }

  /**
   * Get the configuration for a specific module
   * @param moduleKey - Module key
   * @returns Module config object if module is enabled, null otherwise
   */
  getModuleConfig<T = any>(moduleKey: string): T | null {
    const modules = this.effectiveModules$.value;
    const module = modules.find((m) => m.moduleKey === moduleKey);
    return module?.enabled ? (module.config as T) : null;
  }

  /**
   * Clear cached effective modules
   * Useful when user logs out or switches tenant/branch
   */
  clearEffectiveModules(): void {
    this.effectiveModules$.next([]);
  }
}
