import { CommonModule } from '@angular/common';
import { Component, inject, effect } from '@angular/core';
import { DashboardService } from '../../../services/dashboard.service';
import {
  NgApexchartsModule,
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexPlotOptions,
  ApexDataLabels,
  ApexStroke,
  ApexLegend,
  ApexYAxis,
  ApexGrid,
  ApexFill,
  ApexTooltip,
} from 'ng-apexcharts';

@Component({
  selector: 'app-monthly-sales-chart',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './monthly-sales-chart.component.html',
})
export class MonthlySalesChartComponent {
  private ds = inject(DashboardService);
  public series: ApexAxisChartSeries = [{ name: 'Ventas', data: [] }];
  public chart: ApexChart = {
    fontFamily: 'Outfit, sans-serif',
    type: 'bar',
    height: 180,
    toolbar: { show: false },
  };
  public xaxis: ApexXAxis = {
    categories: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ],
    axisBorder: { show: false },
    axisTicks: { show: false },
  };
  public plotOptions: ApexPlotOptions = {
    bar: {
      horizontal: false,
      columnWidth: '39%',
      borderRadius: 5,
      borderRadiusApplication: 'end',
    },
  };
  public dataLabels: ApexDataLabels = { enabled: false };
  public stroke: ApexStroke = {
    show: true,
    width: 4,
    colors: ['transparent'],
  };
  public legend: ApexLegend = {
    show: true,
    position: 'top',
    horizontalAlign: 'left',
    fontFamily: 'Outfit',
  };
  public yaxis: ApexYAxis = { title: { text: undefined } };
  public grid: ApexGrid = { yaxis: { lines: { show: true } } };
  public fill: ApexFill = { opacity: 1 };
  public tooltip: ApexTooltip = {
    x: { show: false },
    y: { formatter: (val: number) => `${val}` },
  };
  public colors: string[] = ['#D8B0FF'];

  isOpen = false;

  constructor() {
    // React to monthlySales signal changes - must be in constructor for injection context
    effect(() => {
      const sales = this.ds.monthlySales();
      if (sales && sales.length === 12) {
        this.series = [
          { name: 'Ventas', data: sales.map((v) => Math.round(v)) },
        ];
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
    this.updateSeries();
  }

  private updateSeries() {
    const sales = this.ds.monthlySales();
    if (sales && sales.length === 12) {
      this.series = [{ name: 'Ventas', data: sales.map((v) => Math.round(v)) }];
    }
  }
}
