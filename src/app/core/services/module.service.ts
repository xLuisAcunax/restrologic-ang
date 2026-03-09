import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
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
   * Observable cache used by existing subscribers.
   */
  private effectiveModules$ = new BehaviorSubject<EffectiveModule[]>([]);

  /**
   * Signal cache used by guards/navigation/computed UI.
   */
  private effectiveModulesState = signal<EffectiveModule[]>([]);

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

    return this.http
      .get<{ ok: boolean; data: EffectiveModule[] }>(
        `${this.baseUrl}/modules/effective`,
        { params }
      )
      .pipe(
        tap((response) => {
          const modules = response.data ?? [];
          this.effectiveModules$.next(modules);
          this.effectiveModulesState.set(modules);
        }),
        catchError(() => {
          this.effectiveModules$.next([]);
          this.effectiveModulesState.set([]);
          return of({ ok: true, data: [] });
        })
      );
  }

  getEffectiveModules(): Observable<EffectiveModule[]> {
    return this.effectiveModules$.asObservable();
  }

  isModuleEnabled(moduleKey: string): boolean {
    const modules = this.effectiveModulesState();
    const module = modules.find((m) => m.moduleKey === moduleKey);
    return module?.enabled ?? false;
  }

  getModuleConfig<T = any>(moduleKey: string): T | null {
    const modules = this.effectiveModulesState();
    const module = modules.find((m) => m.moduleKey === moduleKey);
    return module?.enabled ? (module.config as T) : null;
  }

  clearEffectiveModules(): void {
    this.effectiveModules$.next([]);
    this.effectiveModulesState.set([]);
  }
}
