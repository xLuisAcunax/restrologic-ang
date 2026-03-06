import { CommonModule } from '@angular/common';
import { Component, inject, effect } from '@angular/core';
import { DashboardService } from '../../../services/dashboard.service';
import {
  ApexNonAxisChartSeries,
  ApexChart,
  ApexPlotOptions,
  ApexFill,
  ApexStroke,
  ApexOptions,
  NgApexchartsModule,
} from 'ng-apexcharts';

@Component({
  selector: 'app-monthly-target',
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './monthly-target.component.html',
})
export class MonthlyTargetComponent {
  private ds = inject(DashboardService);
  public series: ApexNonAxisChartSeries = [0];
  public chart: ApexChart = {
    fontFamily: 'Outfit, sans-serif',
    type: 'radialBar',
    height: 330,
    sparkline: { enabled: true },
  };
  public plotOptions: ApexPlotOptions = {
    radialBar: {
      startAngle: -85,
      endAngle: 85,
      hollow: { size: '80%' },
      track: {
        background: '#FF9FA0',
        strokeWidth: '100%',
        margin: 5,
      },
      dataLabels: {
        name: { show: false },
        value: {
          fontSize: '36px',
          fontWeight: '600',
          offsetY: -40,
          color: '#485363',
          formatter: (val: number) => `${val}%`,
        },
      },
    },
  };
  public fill: ApexFill = {
    type: 'solid',
    colors: ['#7AF1A7'],
  };
  public stroke: ApexStroke = {
    lineCap: 'round',
  };
  public labels: string[] = ['Progress'];
  public colors: string[] = ['#FECCD2'];

  isOpen = false;

  constructor() {
    // React to month progress changes - must be in constructor for injection context
    effect(() => {
      const pct = this.ds.monthProgressPct();
      if (pct != null) {
        this.series = [Math.min(999, Math.round(pct * 100) / 100)];
      }
    });
  }

  toggleDropdown() {
    this.isOpen = !this.isOpen;
  }

  closeDropdown() {
    this.isOpen = false;
  }

  ngOnInit() {
    this.ds.init();
    this.update();
  }

  private update() {
    const pct = this.ds.monthProgressPct();
    if (pct != null) {
      this.series = [Math.min(999, Math.round(pct * 100) / 100)];
    }
  }

  get progressPct(): number {
    const pct = this.ds.monthProgressPct();
    return pct != null ? Math.round(pct * 100) : 0;
  }

  get monthToDateSales(): number {
    return this.ds.monthToDateSales() || 0;
  }
  get prevMonthSales(): number {
    return this.ds.prevMonthSales() || 0;
  }
  get monthTarget(): number {
    return this.ds.monthTarget() || 0;
  }

  formatCurrency(val: number): string {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(val || 0);
    } catch {
      return `$ ${Math.round(val || 0).toLocaleString('es-CO')}`;
    }
  }
}
