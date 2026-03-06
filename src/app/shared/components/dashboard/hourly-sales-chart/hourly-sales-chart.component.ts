import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  NgApexchartsModule,
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexStroke,
  ApexXAxis,
  ApexYAxis,
  ApexTooltip,
  ApexGrid,
  ApexLegend,
} from 'ng-apexcharts';
import { DashboardService } from '../../../services/dashboard.service';

@Component({
  selector: 'app-hourly-sales-chart',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './hourly-sales-chart.component.html',
})
export class HourlySalesChartComponent {
  private ds = inject(DashboardService);

  get series(): ApexAxisChartSeries {
    const hours = this.ds.hourlySalesToday();
    return [{ name: 'Ventas', data: hours.map((v) => Math.round(v)) }];
  }

  chart: ApexChart = {
    type: 'bar',
    height: 320,
    fontFamily: 'Outfit, sans-serif',
  };
  dataLabels: ApexDataLabels = { enabled: false };
  stroke: ApexStroke = { show: true, width: 2, colors: ['transparent'] };
  xaxis: ApexXAxis = {
    categories: Array.from({ length: 24 }, (_, i) => i.toString()),
    title: { text: 'Hora' },
  };
  yaxis: ApexYAxis = { title: { text: 'COP' } };
  tooltip: ApexTooltip = {
    y: {
      formatter: (val: number) =>
        new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          maximumFractionDigits: 0,
        }).format(val),
    },
  };
  grid: ApexGrid = { strokeDashArray: 3 };
  legend: ApexLegend = { show: false };

  get totalToday(): number {
    const hours = this.ds.hourlySalesToday();
    return Math.round(hours.reduce((a, b) => a + (b || 0), 0));
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
