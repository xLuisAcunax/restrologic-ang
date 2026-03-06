import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DashboardService } from '../../../services/dashboard.service';

type Row = {
  name: string;
  variants: string;
  category: string;
  price: string;
  status: 'Entregadas' | 'Pendientes' | 'Canceladas';
};

@Component({
  selector: 'app-recent-orders',
  imports: [CommonModule],
  templateUrl: './recent-orders.component.html',
})
export class RecentOrdersComponent {
  private ds = inject(DashboardService);

  ngOnInit() {
    this.ds.init();
  }

  get tableData(): Row[] {
    const orders = this.ds.recentOrders();
    return (orders || []).map((o) => ({
      name: o.code ? String(o.code) : (o.id?.slice(-6) ?? ''),
      variants: `${o.items?.length ?? 0} Productos`,
      category:
        o.source === 'public-menu' ? 'Domicilio' : o.tableName || 'Salón',
      price: this.formatCurrency(o.total || 0),
      status: this.mapStatus(o.status),
    }));
  }

  getBadgeColor(
    status: string,
  ): 'badge badge-success' | 'badge badge-warning' | 'badge badge-error' {
    if (status === 'Entregadas') return 'badge badge-success';
    if (status === 'Pendientes') return 'badge badge-warning';
    return 'badge badge-error';
  }

  private mapStatus(s: any): Row['status'] {
    const v = String(s || '').toLowerCase();
    if (v === 'cancelled') return 'Canceladas';
    if (v === 'served' || v === 'paid' || v === 'closed') return 'Entregadas';
    return 'Pendientes';
  }

  private formatCurrency(value: number): string {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `$ ${Math.round(value).toLocaleString('es-CO')}`;
    }
  }
}
