import { Injectable, computed, signal, inject, effect } from '@angular/core';
import { AuthService } from './auth.service';
import { BranchSummary, BusinessService } from './business.service';

@Injectable({ providedIn: 'root' })
export class BranchSelectionService {
  private authService = inject(AuthService);
  private businessService = inject(BusinessService);
  private lastLoadedKey: string | null = null;

  // Storage key for localStorage persistence
  private readonly STORAGE_KEY = 'selectedBranchId';

  // Signal para mantener el branchId seleccionado
  private _selectedBranchId = signal<string | null>(this.getStoredBranchId());
  private _selectedBranch = signal<BranchSummary | null>(null);

  // Getter público como computed signal (readonly)
  selectedBranchId = computed(() => this._selectedBranchId());
  selectedBranch = computed(() => this._selectedBranch());

  constructor() {
    // React to user context + selected branch to auto-load cache and realtime
    effect(() => {
      const user = this.authService.me();
      const selected = this._selectedBranchId();
      if (!user) return;

      // branchToUse: regular users use their assigned branchId; admins use selected branch
      const branchToUse = user.branchId || selected;
      if (!branchToUse) return;

      const key = `${user.tenantId}:${branchToUse}`;
      if (this.lastLoadedKey === key) return; // avoid duplicate loads
      this.lastLoadedKey = key;

      // Auto-load branch details if needed
      this.loadBranchIfNeeded(branchToUse);
    });
  }

  /**
   * Loads branch details if not already loaded
   */
  private loadBranchIfNeeded(branchId: string): void {
    if (!branchId || this._selectedBranch()?.id === branchId) return;

    this.businessService.getBranch(branchId).subscribe((branch) => {
      this._selectedBranch.set(branch);
    });
  }

  /**
   * Returns the currently loaded branch
   * To load a branch, use setSelectedBranchId() or it will auto-load via the effect
   */
  getSelectedBranch(): BranchSummary | null {
    return this._selectedBranch();
  }

  /**
   * Recupera el branchId almacenado en localStorage
   */
  private getStoredBranchId(): string | null {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return stored || null;
  }

  /**
   * Establece el branchId seleccionado y lo persiste en localStorage
   * También carga automáticamente la información de la sucursal
   */
  setSelectedBranchId(branchId: string | null): void {
    this._selectedBranchId.set(branchId);
    if (branchId) {
      localStorage.setItem(this.STORAGE_KEY, branchId);
      // Load branch details
      this.loadBranchIfNeeded(branchId);
    } else {
      localStorage.removeItem(this.STORAGE_KEY);
      this._selectedBranch.set(null);
    }
  }

  /**
   * Limpia la selección de sucursal
   */
  clearSelection(): void {
    this._selectedBranchId.set(null);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * Obtiene el branchId a usar:
   * - Para usuarios regulares (con branchId asignado): retorna su branchId del perfil
   * - Para usuarios admin: retorna el branchId seleccionado en el selector
   */
  getEffectiveBranchId(): string | null {
    const user = this.authService.me();

    if (!user) return null;

    // Si el usuario tiene un branchId asignado (usuario regular), usar ese
    if (user.branchId) {
      return user.branchId;
    }

    // Si es admin (no tiene branchId asignado), usar el seleccionado
    return this._selectedBranchId();
  }

  /**
   * Verifica si el usuario actual es admin (no tiene branchId asignado)
   */
  isAdminUser(): boolean {
    const user = this.authService.me();
    return user ? user.roles.includes('Admin') : false;
  }
}
