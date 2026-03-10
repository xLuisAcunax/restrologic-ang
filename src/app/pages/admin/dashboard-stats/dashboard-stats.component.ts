import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardSettingsService } from '../../../shared/services/dashboard-settings.service';
import {
  BranchDeliveryPricingBracket,
  BranchDeliverySettingsService,
} from '../../../core/services/branch-delivery-settings.service';
import { BranchSelectionService } from '../../../core/services/branch-selection.service';

@Component({
  selector: 'app-dashboard-stats-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-stats.component.html',
})
export class DashboardStatsComponent {
  private readonly settings = inject(DashboardSettingsService);
  private readonly branchSelection = inject(BranchSelectionService);
  private readonly deliverySettings = inject(BranchDeliverySettingsService);
  private readonly lastLoadedBranchId = signal<string | null>(null);

  readonly branchId = computed(() => this.branchSelection.getEffectiveBranchId());
  readonly branchName = computed(
    () => this.branchSelection.selectedBranch()?.name || 'Sucursal actual'
  );
  readonly deliveryEnabled = signal(true);
  readonly enablePublicMenu = signal(true);
  readonly deliveryRadiusKm = signal(10);
  readonly freeDeliveryThresholdKm = signal<number | null>(3);
  readonly autoAssignmentStrategy = signal<'MANUAL' | 'ROUND_ROBIN' | 'NEAREST'>(
    'MANUAL'
  );
  readonly routeProvider = signal<'NONE' | 'MAPBOX' | 'GOOGLE'>('NONE');
  readonly pricingBrackets = signal<BranchDeliveryPricingBracket[]>([
    { upToKm: 3, baseFee: 0, perKm: null },
    { upToKm: 7, baseFee: 3000, perKm: null },
    { upToKm: 10, baseFee: 5000, perKm: null },
  ]);
  readonly loadingDeliverySettings = signal(false);
  readonly savingDeliverySettings = signal(false);
  readonly deliverySettingsError = signal('');
  readonly deliverySettingsSuccess = signal('');

  constructor() {
    effect(() => {
      const branchId = this.branchId();
      if (!branchId || this.lastLoadedBranchId() === branchId) {
        return;
      }

      this.lastLoadedBranchId.set(branchId);
      this.loadDeliverySettings(branchId);
    });
  }

  get monthlyTargetCOP(): number {
    return this.settings.monthlyTargetCOP();
  }

  get refreshIntervalMs(): number {
    return this.settings.refreshIntervalMs();
  }

  get autoRefreshEnabled(): boolean {
    return this.settings.autoRefreshEnabled();
  }

  get refreshIntervalSeconds(): number {
    return Math.round(this.refreshIntervalMs / 1000);
  }

  updateTarget(val: string) {
    const num = parseInt(val.replace(/[^0-9]/g, '') || '0', 10);
    this.settings.setMonthlyTarget(num);
  }

  updateRefresh(val: number) {
    this.settings.setRefreshInterval(val);
  }

  onRefreshSecondsChange(val: string) {
    const secs = parseInt(val || '1', 10);
    this.updateRefresh(Math.max(1, secs) * 1000);
  }

  toggleAutoRefresh(ev: Event) {
    const checked = (ev.target as HTMLInputElement)?.checked;
    this.settings.setAutoRefreshEnabled(!!checked);
  }

  addBracket() {
    this.pricingBrackets.update((brackets) => {
      const last = brackets[brackets.length - 1];
      return [
        ...brackets,
        {
          upToKm: last ? last.upToKm + 1 : 1,
          baseFee: last?.baseFee ?? 0,
          perKm: last?.perKm ?? null,
        },
      ];
    });
  }

  removeBracket(index: number) {
    this.pricingBrackets.update((brackets) =>
      brackets.filter((_, currentIndex) => currentIndex !== index)
    );
  }

  updateBracket(
    index: number,
    field: keyof BranchDeliveryPricingBracket,
    value: string | number | null
  ) {
    const raw = typeof value === 'string' ? value.trim() : value;
    const parsed =
      raw === '' || raw === null || raw === undefined
        ? null
        : typeof raw === 'number'
          ? raw
          : Number.parseFloat(raw.replace(',', '.')) || 0;

    this.pricingBrackets.update((brackets) =>
      brackets.map((bracket, currentIndex) =>
        currentIndex === index
          ? {
              ...bracket,
              [field]: field === 'perKm' ? parsed : parsed ?? 0,
            }
          : bracket
      )
    );
  }

  saveDeliverySettings() {
    const branchId = this.branchId();
    if (!branchId) {
      return;
    }

    this.savingDeliverySettings.set(true);
    this.deliverySettingsError.set('');
    this.deliverySettingsSuccess.set('');

    this.deliverySettings
      .updateSettings(branchId, {
        deliveryEnabled: this.deliveryEnabled(),
        enablePublicMenu: this.enablePublicMenu(),
        deliveryRadiusKm: this.deliveryRadiusKm(),
        freeDeliveryThresholdKm: this.freeDeliveryThresholdKm(),
        pricingBrackets: this.pricingBrackets(),
        autoAssignmentStrategy: this.autoAssignmentStrategy(),
        routeProvider: this.routeProvider(),
      })
      .subscribe({
        next: (settings) => {
          this.applyDeliverySettings(settings);
          this.savingDeliverySettings.set(false);
          this.deliverySettingsSuccess.set(
            'Opciones de domicilios guardadas correctamente.'
          );
        },
        error: (error) => {
          this.savingDeliverySettings.set(false);
          this.deliverySettingsError.set(
            error?.error?.message ||
              'No fue posible guardar las opciones de domicilios.'
          );
        },
      });
  }

  private loadDeliverySettings(branchId: string) {
    this.loadingDeliverySettings.set(true);
    this.deliverySettingsError.set('');
    this.deliverySettingsSuccess.set('');

    this.deliverySettings.getSettings(branchId).subscribe({
      next: (settings) => {
        this.applyDeliverySettings(settings);
        this.loadingDeliverySettings.set(false);
      },
      error: () => {
        this.loadingDeliverySettings.set(false);
        this.deliverySettingsError.set('');
      },
    });
  }

  private applyDeliverySettings(settings: {
    deliveryEnabled: boolean;
    enablePublicMenu: boolean;
    deliveryRadiusKm: number;
    freeDeliveryThresholdKm?: number | null;
    pricingBrackets: BranchDeliveryPricingBracket[];
    autoAssignmentStrategy: 'MANUAL' | 'ROUND_ROBIN' | 'NEAREST';
    routeProvider: 'NONE' | 'MAPBOX' | 'GOOGLE';
  }) {
    this.deliveryEnabled.set(settings.deliveryEnabled);
    this.enablePublicMenu.set(settings.enablePublicMenu);
    this.deliveryRadiusKm.set(settings.deliveryRadiusKm);
    this.freeDeliveryThresholdKm.set(settings.freeDeliveryThresholdKm ?? null);
    this.pricingBrackets.set(
      settings.pricingBrackets?.length
        ? settings.pricingBrackets
        : [{ upToKm: 3, baseFee: 0, perKm: null }]
    );
    this.autoAssignmentStrategy.set(settings.autoAssignmentStrategy);
    this.routeProvider.set(settings.routeProvider);
  }
}


