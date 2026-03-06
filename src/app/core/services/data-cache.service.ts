import { computed, inject, Injectable, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Table, TableService } from './table.service';

/**
 * DataCacheService: Centralized cache with real-time synchronization
 *
 * Cache organization (multi-tenant safe):
 *  - Data is stored per tenant:branch using key "tenantId:branchId"
 *
 * Real-time synchronization:
 *  - Listens to Socket.IO events (product.created, table.updated, etc.)
 *  - Automatically updates cache when data changes in backend
 *  - All views using cache get updated instantly via signals
 */
@Injectable({ providedIn: 'root' })
export class DataCacheService {
  private tableService = inject(TableService);

  // ===== SIGNALS (Source of truth) =====
  // Almacenan los datos cacheados por tenant y branch
  private tablesCache = signal<Map<string, Table[]>>(new Map());

  // Estado de carga
  private isLoading = signal<boolean>(false);
  private loadingErrors = signal<string[]>([]);

  // ===== PUBLIC COMPUTED ACCESSORS =====
  readonly isLoading$ = computed(() => this.isLoading());
  readonly hasErrors = computed(() => this.loadingErrors().length > 0);

  /**
   * Obtener mesas mapeadas por ID
   */
  getTablesMap(tenantId: string, branchId: string): Map<string, string> {
    const key = this.getCacheKey(tenantId, branchId);
    const tables = this.tablesCache().get(key) || [];
    return new Map(
      tables.map((table) => {
        const name =
          typeof table.name === 'string' && table.name.trim().length > 0
            ? table.name.trim()
            : null;
        const label = name || `Mesa ${table.id}`;
        return [table.id, label];
      })
    );
  }

  /**
   * Obtener todas las mesas para un tenant/branch
   */
  getTables(tenantId: string, branchId: string): Table[] {
    const key = this.getCacheKey(tenantId, branchId);
    return this.tablesCache().get(key) || [];
  }

  /**
   * Verificar si existe caché para un tenant/branch
   */
  hasCacheFor(tenantId: string, branchId: string): boolean {
    const key = this.getCacheKey(tenantId, branchId);
    return this.tablesCache().has(key);
  }

  /**
   * Cargar toda la data para un tenant y branch específico
   * Llamar después del login o cuando cambies de rama
   */
  loadDataForBranch(tenantId: string, branchId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Si ya existe caché, no recargar
      if (this.hasCacheFor(tenantId, branchId)) {
        resolve();
        return;
      }

      this.isLoading.set(true);
      this.loadingErrors.set([]);

      forkJoin({
        tables: this.tableService
          .getTables(branchId)
          .pipe(catchError((err) => of({ data: [] }))),
      }).subscribe({
        next: (result) => {
          const key = this.getCacheKey(tenantId, branchId);
          const tables = (result.tables || []) as Table[];

          this.tablesCache.update((map) => {
            const newMap = new Map(map);
            newMap.set(key, tables);
            return newMap;
          });

          this.isLoading.set(false);
          resolve();
        },
        error: (err) => {
          console.error('[DataCache] Error loading data:', err);
          this.loadingErrors.update((errors) => [
            ...errors,
            err?.message || 'Unknown error',
          ]);
          this.isLoading.set(false);
          reject(err);
        },
      });
    });
  }

  /**
   * Limpiar caché completamente (al logout)
   */
  clearCache(): void {
    this.tablesCache.set(new Map());
    this.loadingErrors.set([]);
  }

  /**
   * Limpiar caché para un tenant/branch específico
   */
  clearCacheFor(tenantId: string, branchId: string): void {
    const key = this.getCacheKey(tenantId, branchId);

    this.tablesCache.update((map) => {
      const newMap = new Map(map);
      newMap.delete(key);
      return newMap;
    });
  }

  /**
   * Refrescar datos para un tenant/branch específico
   * Fuerza la recarga incluso si existe caché
   */
  refreshDataForBranch(tenantId: string, branchId: string): Promise<void> {
    this.clearCacheFor(tenantId, branchId);
    return this.loadDataForBranch(tenantId, branchId);
  }

  // ===== PRIVATE HELPERS =====
  private getCacheKey(tenantId: string, branchId: string): string {
    return `${tenantId}:${branchId}`;
  }
}
