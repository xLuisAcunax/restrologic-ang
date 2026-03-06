import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardSettingsService } from '../../../shared/services/dashboard-settings.service';

@Component({
  selector: 'app-dashboard-stats-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-stats.component.html',
})
export class DashboardStatsComponent {
  private settings: DashboardSettingsService = inject(DashboardSettingsService);

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
}
