import { Component } from '@angular/core';
import { EcommerceMetricsComponent } from '../../../shared/components/dashboard/ecommerce-metrics/ecommerce-metrics.component';
import { MonthlySalesChartComponent } from '../../../shared/components/dashboard/monthly-sales-chart/monthly-sales-chart.component';
import { MonthlyTargetComponent } from '../../../shared/components/dashboard/monthly-target/monthly-target.component';
import { RecentOrdersComponent } from '../../../shared/components/dashboard/recent-orders/recent-orders.component';
import { HourlySalesChartComponent } from '../../../shared/components/dashboard/hourly-sales-chart/hourly-sales-chart.component';
import { TopProductsTodayComponent } from '../../../shared/components/dashboard/top-products-today/top-products-today.component';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'admin-dashboard',
  imports: [
    DecimalPipe,
  ],
  templateUrl: './admin.component.html',
})
export class AdminComponent { }
