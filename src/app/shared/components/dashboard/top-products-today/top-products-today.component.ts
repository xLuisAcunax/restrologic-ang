import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../../../services/dashboard.service';

@Component({
  selector: 'app-top-products-today',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './top-products-today.component.html',
})
export class TopProductsTodayComponent {
  private ds = inject(DashboardService);

  get products() {
    return this.ds.topProductsToday();
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
