import { Injectable, signal, computed, effect } from '@angular/core';

export type DashboardSettings = {
  monthlyTargetCOP: number;
  refreshIntervalMs: number;
  autoRefreshEnabled: boolean;
};

@Injectable({ providedIn: 'root' })
export class DashboardSettingsService {
  // Defaults (will be persisted later)
  private _settings = signal<DashboardSettings>({
    monthlyTargetCOP: 6_000_000,
    refreshIntervalMs: 6000,
    autoRefreshEnabled: true,
  });

  private readonly STORAGE_KEY = 'rl_dashboard_settings_v1';

  readonly settings = this._settings.asReadonly();
  readonly monthlyTargetCOP = computed(() => this._settings().monthlyTargetCOP);
  readonly refreshIntervalMs = computed(
    () => this._settings().refreshIntervalMs
  );
  readonly autoRefreshEnabled = computed(
    () => this._settings().autoRefreshEnabled
  );

  getSettings(): DashboardSettings {
    return this._settings();
  }

  constructor() {
    // Load from localStorage if exists
    this.loadFromStorage();
    // Persist on change
    effect(() => {
      const current = this._settings();
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(current));
      } catch (e) {
        // Silently ignore persistence errors (private mode / quota)
      }
    });
  }

  setMonthlyTarget(val: number) {
    this._settings.update((s) => ({ ...s, monthlyTargetCOP: val }));
  }
  setRefreshInterval(ms: number) {
    this._settings.update((s) => ({
      ...s,
      refreshIntervalMs: Math.max(1000, ms | 0),
    }));
  }
  setAutoRefreshEnabled(v: boolean) {
    this._settings.update((s) => ({ ...s, autoRefreshEnabled: !!v }));
  }

  resetDefaults() {
    this._settings.set({
      monthlyTargetCOP: 6_000_000,
      refreshIntervalMs: 6000,
      autoRefreshEnabled: true,
    });
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      const next: DashboardSettings = {
        monthlyTargetCOP:
          typeof parsed.monthlyTargetCOP === 'number' &&
          parsed.monthlyTargetCOP > 0
            ? parsed.monthlyTargetCOP
            : 6_000_000,
        refreshIntervalMs:
          typeof parsed.refreshIntervalMs === 'number' &&
          parsed.refreshIntervalMs >= 1000
            ? parsed.refreshIntervalMs
            : 6000,
        autoRefreshEnabled: !!parsed.autoRefreshEnabled,
      };
      this._settings.set(next);
    } catch (e) {
      // ignore malformed storage
    }
  }
}
